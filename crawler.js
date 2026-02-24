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
// 2. 브랜드(카테고리) 설정 – 여기에 추가하면 자동으로 수집 대상이 됩니다
//    ★ 모든 페이지가 동일한 HTML 구조(#recom_search_ul, .reco_price, recom_go)를 사용하므로
//      스크래핑 로직은 100% 공유됩니다.
// ─────────────────────────────────────────────
const BRANDS = [
  {
    id: '프리미엄PC',
    listUrl: 'https://www.compuzone.co.kr/product/compuzone_premium_pc.htm?rtq=',
    itemsPerPage: 28,
  },
  {
    id: '추천조립PC',
    listUrl: 'https://www.compuzone.co.kr/product/recommend_list.htm?rtq=',
    itemsPerPage: 15,
  },
];

// ─────────────────────────────────────────────
// 3. 유틸리티
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
// 4. 리스트 페이지에서 상품 목록 수집 (페이지네이션 포함)
// ─────────────────────────────────────────────
async function scrapeListPages(page, brand) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  📦 [${brand.id}] 리스트 수집 시작`);
  console.log(`${'═'.repeat(60)}`);

  await page.goto(brand.listUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('#recom_search_ul > li', { timeout: 15000 }).catch(() => {
    console.log(`  ⚠ [${brand.id}] 리스트 요소 미발견`);
  });
  await page.waitForTimeout(3000);

  // 총 페이지 수 감지 (페이지가 1개뿐이면 페이지 링크가 없을 수 있으므로 기본값 1)
  const totalPages = await page.$$eval('div.page_area a.num', (links) => links.length).catch(() => 0) || 1;
  console.log(`  📄 총 ${totalPages}페이지 감지`);

  let allProducts = [];

  for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
    console.log(`    📄 ${currentPage}/${totalPages} 페이지 수집 중...`);

    if (currentPage > 1) {
      const offset = (currentPage - 1) * brand.itemsPerPage;
      await page.evaluate(({ pg, os }) => {
        if (typeof recom_go === 'function') recom_go(pg, os);
      }, { pg: currentPage, os: offset });
      await page.waitForTimeout(3000);
      await page.waitForSelector('#recom_search_ul > li', { timeout: 15000 }).catch(() => { });
      await page.waitForTimeout(1000);
    }

    // 현재 페이지의 상품 목록 추출
    // ★ 상세 URL은 <a> href에서 직접 추출 (MediumDivNo, DivNo가 브랜드/상품별로 다르므로)
    const pageProducts = await page.$$eval('#recom_search_ul > li', (elements) => {
      const results = [];
      elements.forEach((el) => {
        const nameEl = el.querySelector('p.name');
        const priceDiv = el.querySelector('.reco_price');
        // 상세 페이지 링크: <li> 안의 첫 번째 <a> 태그에서 href 추출
        const linkEl = el.querySelector('a[href*="product_detail"]');

        if (nameEl && priceDiv) {
          const name = (nameEl?.innerText || '').trim();
          const pNo = priceDiv?.getAttribute('data-pricetable') || '';
          const rawPrice = priceDiv?.getAttribute('data-price') || '0';
          const rawDiscount = priceDiv?.getAttribute('data-discountprice') || '0';
          const originalPrice = Number(rawPrice.replace(/,/g, '')) || 0;
          const discountPrice = Number(rawDiscount.replace(/,/g, '')) || 0;

          // 상세 페이지 URL 조합
          let detailUrl = '';
          if (linkEl) {
            const href = linkEl.getAttribute('href') || '';
            // 상대 경로 → 절대 경로 변환
            if (href.startsWith('http')) {
              detailUrl = href;
            } else {
              detailUrl = 'https://www.compuzone.co.kr/product/' + href.replace(/^\.\.\/product\//, '').replace(/^\.\.\//, '');
            }
          }
          // href를 추출하지 못한 경우 ProductNo로 직접 조합 (폴백)
          if (!detailUrl && pNo) {
            detailUrl = `https://www.compuzone.co.kr/product/product_detail.htm?ProductNo=${pNo}&BigDivNo=1&MediumDivNo=1&SearchType=Y`;
          }

          if (pNo) {
            results.push({
              productNo: pNo,
              name,
              originalPrice,
              discountPrice,
              detailUrl,
              components: [],
            });
          }
        }
      });
      return results;
    });

    console.log(`    ✅ ${pageProducts.length}개 추출`);
    allProducts = allProducts.concat(pageProducts);
  }

  console.log(`  🏁 [${brand.id}] 전체 ${allProducts.length}개 상품 수집 완료\n`);
  return allProducts;
}

// ─────────────────────────────────────────────
// 5. 상세 페이지 부품 스크래핑 (공통 로직)
// ─────────────────────────────────────────────
async function scrapeDetailComponents(page, products, brandId) {
  console.log(`  🔧 [${brandId}] 상세 부품 스크래핑 시작 (${products.length}개)...`);

  for (let i = 0; i < products.length; i++) {
    const item = products[i];
    console.log(`    [${i + 1}/${products.length}] ${item.name}`);

    try {
      await page.goto(item.detailUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForSelector('div.recom_L table.table_style_recom', { timeout: 15000 }).catch(() => {
        console.log(`      ⚠ 부품 테이블 미발견 (${item.productNo})`);
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
      console.log(`      → ${componentList.length}개 부품`);
    } catch (e) {
      console.log(`      ❌ 오류: ${e.message}`);
      item.components = [];
    }
    await page.waitForTimeout(2000);
  }
}

// ─────────────────────────────────────────────
// 6. Firestore 저장 (브랜드별 서브컬렉션 분리)
//    구조: compuzone_prices/{날짜}/{브랜드명}/{ProductNo}
// ─────────────────────────────────────────────
async function saveToFirestore(products, brandId, todayStr) {
  console.log(`  💾 [${brandId}] Firestore 저장 시작 (${products.length}건)...`);

  // 날짜 마스터 문서 업데이트
  const masterRef = db.collection('compuzone_prices').doc(todayStr);
  await masterRef.set({
    date: todayStr,
    [`${brandId}_count`]: products.length,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  // 450개 단위 batch commit (Firestore 500건 제한 방어)
  const BATCH_LIMIT = 450;
  for (let start = 0; start < products.length; start += BATCH_LIMIT) {
    const batch = db.batch();
    const chunk = products.slice(start, start + BATCH_LIMIT);

    for (const item of chunk) {
      const docRef = masterRef.collection(brandId).doc(item.productNo);
      batch.set(docRef, {
        ...item,
        brand: brandId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
    console.log(`    ✅ ${start + 1}~${start + chunk.length}번째 저장 완료`);
  }
}

// ─────────────────────────────────────────────
// 7. 메인 실행
// ─────────────────────────────────────────────
async function trackCompuzone() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  const todayStr = getTodayDateString();

  try {
    for (const brand of BRANDS) {
      // 1단계: 리스트 수집
      const products = await scrapeListPages(page, brand);
      if (products.length === 0) {
        console.log(`  ⚠ [${brand.id}] 상품 0개 – 건너뜁니다.`);
        continue;
      }

      // 2단계: 상세 부품 스크래핑
      await scrapeDetailComponents(page, products, brand.id);

      // 3단계: Firestore 저장
      await saveToFirestore(products, brand.id, todayStr);

      console.log(`\n  🏁 [${brand.id}] 완료! ${products.length}건 저장됨.`);

      // 샘플 출력
      if ((products[0]?.components || []).length > 0) {
        console.log(`\n  📋 [샘플] ${products[0].name}:`);
        (products[0].components || []).forEach((c) => {
          console.log(`    - [${c.type}] ${c.partName} | ${Number(c.partPrice).toLocaleString()}원 x ${c.quantity}`);
        });
      }
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ✅ 전체 크롤링 완료 (${todayStr})`);
    console.log(`${'═'.repeat(60)}`);

  } catch (error) {
    console.error('❌ [치명적 에러]:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

trackCompuzone();
