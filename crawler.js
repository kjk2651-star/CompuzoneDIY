const { chromium } = require('playwright');
const admin = require('firebase-admin');

// 1. Firebase Admin SDK 연결 (환경 변수 또는 직접 입력)
// 로컬 테스트 시에는 .env의 값을 불러오거나 여기에 직접 넣습니다.
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID || "compuzone-diy",
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL || "firebase-adminsdk-fbsvc@compuzone-diy.iam.gserviceaccount.com",
  // GitHub Actions에서 줄바꿈이 깨지는 것을 방지하기 위한 정규식 처리
  privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, '\n'),
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// 2. 오늘 날짜 구하기 (YYYY-MM-DD 포맷)
function getTodayDateString() {
  const today = new Date();
  // 한국 시간(KST) 기준으로 안전하게 맞추기 위함
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(today.getTime() + kstOffset);

  const year = kstDate.getUTCFullYear();
  const month = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kstDate.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

async function trackCompuzone() {
  const browser = await chromium.launch({ headless: true }); // Github Actions 용이므로 headless: true 고정
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const mainUrl = 'https://www.compuzone.co.kr/product/compuzone_premium_pc.htm?rtq=';
    console.log(`[1단계] 메인 페이지 접속 중...`);
    await page.goto(mainUrl, { waitUntil: 'domcontentloaded' });

    // 1단계: 프리미엄 PC 리스트 추출
    const products = await page.$$eval('#recom_search_ul > li', (elements) => {
      const results = [];
      elements.forEach((el) => {
        const nameEl = el.querySelector('p.name');
        const priceDiv = el.querySelector('.reco_price');

        if (nameEl && priceDiv) {
          const name = nameEl.innerText.trim();
          const pNo = priceDiv.getAttribute('data-pricetable');

          let originalPrice = 0;
          let discountPrice = 0;

          const rawPrice = priceDiv.getAttribute('data-price');
          if (rawPrice) originalPrice = Number(rawPrice.replace(/,/g, ''));

          const rawDiscount = priceDiv.getAttribute('data-discountprice');
          if (rawDiscount) discountPrice = Number(rawDiscount.replace(/,/g, ''));

          results.push({
            productNo: pNo,
            name: name,
            originalPrice: originalPrice,
            discountPrice: discountPrice,
            detailUrl: `https://www.compuzone.co.kr/product/product_detail.htm?ProductNo=${pNo}`,
            components: []
          });
        }
      });
      return results;
    });

    console.log(`총 ${products.length}개의 리스트 발견. 2단계 부품 스크래핑 시작...`);

    // 2단계: 개별 상세페이지 추출
    for (let i = 0; i < products.length; i++) {
      const item = products[i];
      console.log(`[${i + 1}/${products.length}] ${item.name} 추출 중...`);

      await page.goto(item.detailUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('table.table_style_recom', { timeout: 10000 }).catch(() => { });

      const componentList = await page.$$eval('table.table_style_recom tr', rows => {
        return rows.map(row => {
          const typeEl = row.querySelector('td.tit');
          const nameEl = row.querySelector('td.name a') || row.querySelector('td.name');
          const priceEl = row.querySelector('td.price');

          if (typeEl && nameEl) {
            const type = typeEl.innerText.trim();
            const partName = nameEl.innerText.trim();
            let partPrice = 0;
            if (priceEl) {
              const textPrice = priceEl.innerText.replace(/[^0-9]/g, '');
              partPrice = Number(textPrice) || 0;
            }
            return { type, partName, partPrice };
          }
          return null;
        }).filter(item => item !== null);
      }).catch(e => []);

      item.components = componentList;
      item.updatedAt = admin.firestore.FieldValue.serverTimestamp(); // Firestore 서버 시간 기록

      await page.waitForTimeout(1500);
    }

    // 3단계: Firebase Firestore에 저장
    console.log('\n[3단계] Firebase 접속 및 데이터 적재 시작...');
    const todayStr = getTodayDateString(); // 예: "2026-02-24"
    const batch = db.batch(); // 대량 쓰기를 위한 batch 연산

    // 구조: compuzone_prices (Collection) > "YYYY-MM-DD" (Document) > products (Subcollection) > "ProductNo" (Document)
    for (const item of products) {
      // 이번 기록의 고유 문서 ID로 ProductNo 사용
      const docRef = db.collection('compuzone_prices').doc(todayStr).collection('products').doc(item.productNo);
      batch.set(docRef, item, { merge: true }); // 기존에 있으면 덮어쓰고, 없으면 생성 (merge)
    }

    // 추가로, 날짜 리스트만 빠르게 가져올 수 있도록 상위 문서에도 타임스탬프 기록
    const masterDocRef = db.collection('compuzone_prices').doc(todayStr);
    batch.set(masterDocRef, {
      date: todayStr,
      totalCount: products.length,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await batch.commit();
    console.log(`✅ [완료] ${todayStr} 일자 ${products.length}개 상품 부품가 및 스펙 DB 저장 전송 성공.`);

  } catch (error) {
    console.error('❌ [Error] 크롤러 실행 중 중대한 에러가 발생했습니다:', error);
    process.exit(1); // Github Actions가 실패했음을 인지하도록 1로 종료
  } finally {
    await browser.close();
  }
}

trackCompuzone();
