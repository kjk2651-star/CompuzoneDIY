const { chromium } = require('playwright');
const admin = require('firebase-admin');

// ─────────────────────────────────────────────
// 1. Firebase Admin SDK 초기화
// ─────────────────────────────────────────────
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID || "compuzone-diy",
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL || "firebase-adminsdk-fbsvc@compuzone-diy.iam.gserviceaccount.com",
  privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, '\n'),
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

// ─────────────────────────────────────────────
// 2. 한국 시간(KST) 기준 오늘 날짜 생성
// ─────────────────────────────────────────────
function getTodayDateString() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─────────────────────────────────────────────
// 3. 메인 크롤러 함수
// ─────────────────────────────────────────────
async function trackCompuzone() {
  // headless: true → GitHub Actions 등 서버 환경에서 필수
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // ── [1단계] 메인 리스트 페이지에서 상품 목록 추출 ──
    const mainUrl = 'https://www.compuzone.co.kr/product/compuzone_premium_pc.htm?rtq=';
    console.log('[1단계] 메인 리스트 페이지 접속 중...');
    await page.goto(mainUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // ★ 핵심: 리스트가 JavaScript로 동적 렌더링되므로 반드시 해당 요소가 나타날 때까지 대기
    await page.waitForSelector('#recom_search_ul > li', { timeout: 15000 }).catch(() => {
      console.log('⚠ 리스트 요소를 찾지 못했습니다. 페이지 구조가 변경되었을 수 있습니다.');
    });
    // 추가 안전 대기 (동적 렌더링 완료 시간 확보)
    await page.waitForTimeout(3000);

    const products = await page.$$eval('#recom_search_ul > li', (elements) => {
      const results = [];
      elements.forEach((el) => {
        const nameEl = el.querySelector('p.name');
        const priceDiv = el.querySelector('.reco_price');

        if (nameEl && priceDiv) {
          const name = (nameEl?.innerText || '').trim();
          const pNo = priceDiv?.getAttribute('data-pricetable') || '';

          // 방어적 코딩: 가격 문자열에서 쉼표 제거 후 Number 변환
          const rawPrice = priceDiv?.getAttribute('data-price') || '0';
          const rawDiscount = priceDiv?.getAttribute('data-discountprice') || '0';
          const originalPrice = Number(rawPrice.replace(/,/g, '')) || 0;
          const discountPrice = Number(rawDiscount.replace(/,/g, '')) || 0;

          if (pNo) {
            results.push({
              productNo: pNo,
              name: name,
              originalPrice: originalPrice,
              discountPrice: discountPrice,
              detailUrl: `https://www.compuzone.co.kr/product/product_detail.htm?ProductNo=${pNo}&BigDivNo=1&MediumDivNo=1447&DivNo=4703&SearchType=Y`,
              components: []
            });
          }
        }
      });
      return results;
    });

    console.log(`✅ 총 ${products.length}개의 프리미엄 PC 리스트 발견.`);
    if (products.length === 0) {
      console.log('⚠ 상품이 0개입니다. 크롤링을 중단합니다.');
      await browser.close();
      return;
    }

    // ── [2단계] 각 상품의 상세 페이지에서 부품 스크래핑 ──
    console.log('\n[2단계] 각 PC 상세 페이지로 이동하여 부품 스크래핑을 시작합니다...');

    for (let i = 0; i < products.length; i++) {
      const item = products[i];
      console.log(`  [${i + 1}/${products.length}] ${item.name}`);

      try {
        await page.goto(item.detailUrl, { waitUntil: 'networkidle', timeout: 30000 });

        // ★ 핵심: 부품 테이블(div.recom_L > table.table_style_recom)이 렌더링될 때까지 대기
        await page.waitForSelector('div.recom_L table.table_style_recom', { timeout: 15000 }).catch(() => {
          console.log(`    ⚠ 부품 테이블을 찾지 못했습니다 (${item.productNo})`);
        });
        await page.waitForTimeout(2000);

        // ★ 핵심 로직: 사용자가 제공한 HTML 구조에 정확히 맞춘 셀렉터
        const componentList = await page.$$eval('div.recom_L table.table_style_recom tbody tr', (rows) => {
          const results = [];
          rows.forEach((row) => {
            // <th>가 있는 행은 헤더이므로 스킵
            if (row.querySelector('th')) return;

            const titEl = row.querySelector('td.tit');
            if (!titEl) return;

            const type = (titEl.innerText || '').trim();
            // "옵션추가", "MD's 추천", "서비스", "운영체제" 등 선택 사항(옵션)은 스킵
            if (type.includes('옵션추가') || type.includes('MD') || type === '서비스' || type.includes('운영체제')) return;

            // 부품명 추출: 1) a 태그 직접 링크, 2) 드롭다운(span.txt) 순서로 시도
            let partName = '';
            const nameLink = row.querySelector('td.name > a');
            const nameDropdown = row.querySelector('td.name span.txt');

            if (nameLink) {
              partName = (nameLink.innerText || '').trim();
            } else if (nameDropdown) {
              partName = (nameDropdown.innerText || '').trim();
              // 드롭다운 텍스트에서 "▶ PC용◀ 1개" 등의 불필요한 접미사 제거
              partName = partName.replace(/▶.*?◀.*$/g, '').trim();
            }

            if (!partName) return;

            // 가격 추출: td.price의 prm_ori 속성에서 순수 숫자값을 가져옴 (가장 안전)
            const priceEl = row.querySelector('td.price');
            let partPrice = 0;
            if (priceEl) {
              const prmOri = priceEl.getAttribute('prm_ori');
              if (prmOri) {
                partPrice = Number(prmOri) || 0;
              } else {
                // prm_ori가 없으면 텍스트에서 숫자만 추출
                const textPrice = (priceEl.innerText || '').replace(/[^0-9]/g, '');
                partPrice = Number(textPrice) || 0;
              }
            }

            // 수량 추출
            const numEl = row.querySelector('td.num');
            let quantity = 1;
            if (numEl) {
              const prmOriNum = numEl.getAttribute('prm_ori_num');
              if (prmOriNum) {
                quantity = Number(prmOriNum) || 1;
              } else {
                const numText = (numEl.innerText || '').trim();
                const parsed = parseInt(numText, 10);
                if (!isNaN(parsed) && parsed > 0) quantity = parsed;
              }
            }

            results.push({
              type: type,
              partName: partName,
              partPrice: partPrice,
              quantity: quantity,
            });
          });
          return results;
        }).catch((e) => {
          console.log(`    ❌ 부품 추출 실패: ${e.message}`);
          return [];
        });

        item.components = componentList;
        console.log(`    → ${componentList.length}개 부품 추출 완료`);

      } catch (detailError) {
        console.log(`    ❌ 상세 페이지 접속 오류 (${item.productNo}): ${detailError.message}`);
        item.components = [];
      }

      // 서버 차단 방지용 대기 (2초)
      await page.waitForTimeout(2000);
    }

    // ── [3단계] Firebase Firestore에 저장 ──
    console.log('\n[3단계] Firebase Firestore에 데이터 적재 시작...');
    const todayStr = getTodayDateString();
    const batch = db.batch();

    // 컬렉션 구조: compuzone_prices/{YYYY-MM-DD}/products/{ProductNo}
    for (const item of products) {
      const docRef = db.collection('compuzone_prices').doc(todayStr).collection('products').doc(item.productNo);
      batch.set(docRef, {
        ...item,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    // 날짜 인덱스 문서
    const masterDocRef = db.collection('compuzone_prices').doc(todayStr);
    batch.set(masterDocRef, {
      date: todayStr,
      totalCount: products.length,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await batch.commit();
    console.log(`\n✅ [완료] ${todayStr} 일자 / ${products.length}개 상품 / 부품가 및 스펙 DB 저장 성공!`);

    // 디버그용: 첫 번째 상품의 부품 리스트를 요약 출력
    if (products.length > 0 && (products[0]?.components || []).length > 0) {
      console.log('\n📋 [샘플 확인] 첫 번째 상품 부품 현황:');
      (products[0].components || []).forEach((c) => {
        console.log(`  - [${c.type}] ${c.partName} | ${Number(c.partPrice).toLocaleString()}원 x ${c.quantity}`);
      });
    }

  } catch (error) {
    console.error('❌ [치명적 에러] 크롤러 실행 중 문제 발생:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

trackCompuzone();
