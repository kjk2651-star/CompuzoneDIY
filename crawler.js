const { chromium } = require('playwright');
const admin = require('firebase-admin');

// ─────────────────────────────────────────────
// 1. Firebase Admin SDK 초기화
//    GitHub Actions에서 private key PEM 디코딩 에러 방지를 위해
//    전체 서비스 계정 JSON을 하나의 Secret(FIREBASE_SERVICE_ACCOUNT)에 넣는 방식 사용
// ─────────────────────────────────────────────
let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  // ★ 권장 방식: 서비스 계정 JSON 통째로 넣기
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  credential = admin.credential.cert(sa);
} else {
  // 로컬 개발용 폴백 (개별 환경변수)
  credential = admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID || "compuzone-diy",
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || "firebase-adminsdk-fbsvc@compuzone-diy.iam.gserviceaccount.com",
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, '\n'),
  });
}

if (!admin.apps.length) {
  admin.initializeApp({ credential });
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
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  let allProducts = [];

  try {
    // ── [1단계] 메인 리스트: 모든 페이지 순회하며 상품 목록 수집 ──
    const mainUrl = 'https://www.compuzone.co.kr/product/compuzone_premium_pc.htm?rtq=';
    console.log('[1단계] 메인 리스트 페이지 접속 중...');
    await page.goto(mainUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#recom_search_ul > li', { timeout: 15000 }).catch(() => {
      console.log('⚠ 리스트 요소를 찾지 못했습니다.');
    });
    await page.waitForTimeout(3000);

    // ★ 페이지네이션: 총 페이지 수를 먼저 파악
    const totalPages = await page.$$eval('div.page_area a.num', (links) => links.length);
    console.log(`📄 총 ${totalPages}페이지 발견.`);

    for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
      console.log(`\n  📄 ${currentPage}/${totalPages} 페이지 수집 중...`);

      if (currentPage > 1) {
        // ★ 핵심: 컴퓨존의 자바스크립트 함수 recom_go(page, offset)를 직접 호출
        const offset = (currentPage - 1) * 28; // 페이지당 28개씩
        await page.evaluate(({ pg, os }) => {
          // 전역 함수 recom_go가 존재하면 호출
          if (typeof recom_go === 'function') recom_go(pg, os);
        }, { pg: currentPage, os: offset });

        // 페이지 전환 후 새 리스트가 렌더링될 때까지 대기
        await page.waitForTimeout(3000);
        await page.waitForSelector('#recom_search_ul > li', { timeout: 15000 }).catch(() => { });
        await page.waitForTimeout(1000);
      }

      // 현재 페이지의 상품 목록 추출
      const pageProducts = await page.$$eval('#recom_search_ul > li', (elements) => {
        const results = [];
        elements.forEach((el) => {
          const nameEl = el.querySelector('p.name');
          const priceDiv = el.querySelector('.reco_price');
          if (nameEl && priceDiv) {
            const name = (nameEl?.innerText || '').trim();
            const pNo = priceDiv?.getAttribute('data-pricetable') || '';
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

      console.log(`  ✅ ${pageProducts.length}개 상품 추출`);
      allProducts = allProducts.concat(pageProducts);
    }

    console.log(`\n✅ 전 페이지 합계: 총 ${allProducts.length}개의 프리미엄 PC 리스트 발견.`);
    if (allProducts.length === 0) {
      console.log('⚠ 상품이 0개입니다. 크롤링을 중단합니다.');
      await browser.close();
      return;
    }

    // ── [2단계] 각 상품의 상세 페이지에서 부품 스크래핑 ──
    console.log('\n[2단계] 각 PC 상세 페이지로 이동하여 부품 스크래핑...');

    for (let i = 0; i < allProducts.length; i++) {
      const item = allProducts[i];
      console.log(`  [${i + 1}/${allProducts.length}] ${item.name}`);

      try {
        await page.goto(item.detailUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForSelector('div.recom_L table.table_style_recom', { timeout: 15000 }).catch(() => {
          console.log(`    ⚠ 부품 테이블 미발견 (${item.productNo})`);
        });
        await page.waitForTimeout(2000);

        const componentList = await page.$$eval('div.recom_L table.table_style_recom tbody tr', (rows) => {
          const results = [];
          rows.forEach((row) => {
            if (row.querySelector('th')) return;
            const titEl = row.querySelector('td.tit');
            if (!titEl) return;

            const type = (titEl.innerText || '').trim();
            if (type.includes('옵션추가') || type.includes('MD') || type === '서비스' || type.includes('운영체제')) return;

            let partName = '';
            const nameLink = row.querySelector('td.name > a');
            const nameDropdown = row.querySelector('td.name span.txt');
            if (nameLink) {
              partName = (nameLink.innerText || '').trim();
            } else if (nameDropdown) {
              partName = (nameDropdown.innerText || '').trim();
              partName = partName.replace(/▶.*?◀.*$/g, '').trim();
            }
            if (!partName) return;

            const priceEl = row.querySelector('td.price');
            let partPrice = 0;
            if (priceEl) {
              const prmOri = priceEl.getAttribute('prm_ori');
              if (prmOri) {
                partPrice = Number(prmOri) || 0;
              } else {
                const textPrice = (priceEl.innerText || '').replace(/[^0-9]/g, '');
                partPrice = Number(textPrice) || 0;
              }
            }

            const numEl = row.querySelector('td.num');
            let quantity = 1;
            if (numEl) {
              const prmOriNum = numEl.getAttribute('prm_ori_num');
              if (prmOriNum) {
                quantity = Number(prmOriNum) || 1;
              }
            }

            results.push({ type, partName, partPrice, quantity });
          });
          return results;
        }).catch(() => []);

        item.components = componentList;
        console.log(`    → ${componentList.length}개 부품 추출 완료`);

      } catch (detailError) {
        console.log(`    ❌ 상세 페이지 오류 (${item.productNo}): ${detailError.message}`);
        item.components = [];
      }
      await page.waitForTimeout(2000);
    }

    // ── [3단계] Firebase Firestore에 저장 ──
    // Firestore batch는 최대 500건이므로, 500건 단위로 나눠 커밋
    console.log('\n[3단계] Firebase Firestore에 데이터 적재 시작...');
    const todayStr = getTodayDateString();

    // 날짜 인덱스 문서 먼저 기록
    await db.collection('compuzone_prices').doc(todayStr).set({
      date: todayStr,
      totalCount: allProducts.length,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // 500개 단위로 batch commit
    const BATCH_LIMIT = 450; // 안전 마진
    for (let start = 0; start < allProducts.length; start += BATCH_LIMIT) {
      const batch = db.batch();
      const chunk = allProducts.slice(start, start + BATCH_LIMIT);

      for (const item of chunk) {
        const docRef = db.collection('compuzone_prices').doc(todayStr).collection('products').doc(item.productNo);
        batch.set(docRef, {
          ...item,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
      await batch.commit();
      console.log(`  💾 ${start + 1}~${start + chunk.length}번째 상품 저장 완료`);
    }

    console.log(`\n✅ [완료] ${todayStr} / 총 ${allProducts.length}개 상품 / DB 저장 성공!`);

    // 디버그용: 첫 번째 상품 부품 출력
    if (allProducts.length > 0 && (allProducts[0]?.components || []).length > 0) {
      console.log('\n📋 [샘플] 첫 번째 상품:');
      (allProducts[0].components || []).forEach((c) => {
        console.log(`  - [${c.type}] ${c.partName} | ${Number(c.partPrice).toLocaleString()}원 x ${c.quantity}`);
      });
    }

  } catch (error) {
    console.error('❌ [치명적 에러]:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

trackCompuzone();
