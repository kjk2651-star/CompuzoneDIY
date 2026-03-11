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
//    type: 'recom' → 추천/프리미엄 PC (페이지네이션)
//    type: 'product_list' → 일반 부품 리스트 (무한 스크롤, 로그인 필요)
// ─────────────────────────────────────────────
const BRANDS = [
  {
    id: '프리미엄PC',
    listUrl: 'https://www.compuzone.co.kr/product/compuzone_premium_pc.htm?rtq=',
    itemsPerPage: 28,
    type: 'recom',
  },
  {
    id: '추천조립PC',
    listUrl: 'https://www.compuzone.co.kr/product/recommend_list.htm?rtq=',
    itemsPerPage: 28,
    type: 'recom',
  },
  {
    id: '아이웍스',
    listUrl: 'https://www.compuzone.co.kr/product/iworks_list.htm',
    itemsPerPage: 28,
    type: 'recom',
  },
  {
    id: '그래픽카드',
    listUrl: 'https://www.compuzone.co.kr/product/product_list.htm?BigDivNo=4&MediumDivNo=1016',
    type: 'product_list',
    requiresLogin: true,
  },
  {
    id: '메인보드',
    listUrl: 'https://www.compuzone.co.kr/product/product_list.htm?BigDivNo=4&MediumDivNo=1013',
    type: 'product_list',
    requiresLogin: true,
  },
];

// ─────────────────────────────────────────────
// 2-1. 컴퓨존 로그인 자격증명
// ─────────────────────────────────────────────
const COMPUZONE_ID = process.env.COMPUZONE_ID || '';
const COMPUZONE_PW = process.env.COMPUZONE_PW || '';

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
// 3-1. 진행률 Firestore 업데이트
//      대시보드에서 실시간으로 진행 상태를 폴링할 수 있도록
//      crawl_status 컬렉션에 진행률을 기록합니다.
// ─────────────────────────────────────────────
async function updateProgress(status, percent, detail = '') {
  try {
    await db.collection('crawl_status').doc('latest').set({
      status,      // 'running' | 'done' | 'error'
      percent,     // 0~100
      detail,      // 현재 작업 설명
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    // 진행률 업데이트 실패 시에도 크롤링은 계속 진행
    console.log(`  ⚠ 진행률 업데이트 실패: ${e.message}`);
  }
}

// ─────────────────────────────────────────────
// 4-0. 컴퓨존 로그인 (product_list 크롤링 시 필요)
// ─────────────────────────────────────────────
let isLoggedIn = false;

async function loginToCompuzone(page) {
  if (isLoggedIn) return true;

  console.log('\n  🔐 컴퓨존 로그인 시도...');
  await page.goto('https://www.compuzone.co.kr', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // login() 함수 호출로 로그인 모달 열기
  await page.evaluate(() => { if (typeof login === 'function') login(); });
  await page.waitForTimeout(2000);

  // ID/PW 입력
  const idField = await page.$('#member_id');
  const pwField = await page.$('input[type="password"]');
  if (!idField || !pwField) {
    console.log('  ❌ 로그인 폼을 찾을 수 없습니다.');
    return false;
  }

  await page.fill('#member_id', COMPUZONE_ID);
  await pwField.fill(COMPUZONE_PW);

  // login_check() 호출로 로그인 실행
  await page.evaluate(() => { if (typeof login_check === 'function') login_check(); });
  await page.waitForTimeout(5000);

  // 로그인 성공 확인
  const logoutEl = await page.$('a:has-text("로그아웃"), a[href*="logout"]');
  if (logoutEl) {
    console.log('  ✅ 로그인 성공!');
    isLoggedIn = true;
    return true;
  }

  console.log('  ❌ 로그인 실패 - 로그아웃 링크를 찾을 수 없습니다.');
  return false;
}

// ─────────────────────────────────────────────
// 4-1. 일반 부품 리스트 수집 (페이지네이션 방식)
//      product_list.htm 페이지용 – GotoPage() JS 함수 호출로 페이지 이동
// ─────────────────────────────────────────────

// 현재 페이지에 표시된 상품 추출 헬퍼
async function extractProductsOnPage(page, mediumDivNo) {
  return await page.$$eval('ul#product_list_ul > li.li-obj', (items, divNo) => {
    return items.map((item) => {
      const pNo = (item.id || '').replace('li-pno-', '');
      if (!pNo) return null;

      const nameEl = item.querySelector('.prd_info_name');
      const name = nameEl ? nameEl.innerText.trim() : '';

      // 가격 추출: 판매가 / 맞춤가 / 쿠폰적용가 중 최저가 사용
      const priceDiv = item.querySelector('[data-customprice]') || item.querySelector('[data-price]');
      let originalPrice = 0;
      let discountPrice = 0;

      if (priceDiv) {
        // 판매가: data-price
        const sellPrice = Number((priceDiv.getAttribute('data-price') || '0').replace(/[^0-9]/g, '')) || 0;
        // 맞춤가: data-customprice
        const customPrice = Number((priceDiv.getAttribute('data-customprice') || '0').replace(/[^0-9]/g, '')) || 0;

        originalPrice = sellPrice || customPrice; // 판매가(정가)

        // 쿠폰적용가: .price_Layer .sum dd 에서 추출
        let couponPrice = 0;
        const couponEl = item.querySelector('.price_Layer .sum dd, .prc_guide_ly .sum dd');
        if (couponEl) {
          couponPrice = Number((couponEl.innerText || '').replace(/[^0-9]/g, '')) || 0;
        }

        // 판매가 / 맞춤가 / 쿠폰적용가 중 0이 아닌 최저가를 discountPrice로
        const candidates = [sellPrice, customPrice, couponPrice].filter(p => p > 0);
        discountPrice = candidates.length > 0 ? Math.min(...candidates) : 0;
      }

      // data 속성이 없을 경우 strong.number 폴백
      if (originalPrice === 0 && discountPrice === 0) {
        const priceEl = item.querySelector('strong.number');
        originalPrice = Number((priceEl ? priceEl.innerText : '').replace(/[^0-9]/g, '')) || 0;
      }

      const linkEl = item.querySelector('a[href*="product_detail"]');
      let detailUrl = '';
      if (linkEl) {
        const href = linkEl.getAttribute('href') || '';
        detailUrl = href.startsWith('http')
          ? href
          : 'https://www.compuzone.co.kr/product/' + href.replace(/^\.\.\/product\//, '').replace(/^\.\.\//, '');
      }
      if (!detailUrl && pNo) {
        detailUrl = `https://www.compuzone.co.kr/product/product_detail.htm?ProductNo=${pNo}&BigDivNo=4&MediumDivNo=${divNo}&SearchType=Y`;
      }

      const specEl = item.querySelector('.prd_subTxt, .prd_spec, .spec_txt');
      const specText = specEl ? specEl.innerText.trim() : '';

      return { productNo: pNo, name, originalPrice, discountPrice, detailUrl, specText, components: [] };
    }).filter(Boolean);
  }, mediumDivNo);
}

async function scrapeProductListPages(page, brand) {
  const ITEMS_PER_PAGE = 60;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  📦 [${brand.id}] 부품 리스트 수집 시작 (페이지네이션)`);
  console.log(`${'═'.repeat(60)}`);

  await page.goto(brand.listUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  try {
    await page.waitForSelector('ul#product_list_ul > li.li-obj', { timeout: 15000 });
  } catch {
    console.log(`  ⚠ [${brand.id}] 상품 리스트 미발견. 건너뜁니다.`);
    return [];
  }

  // 총 상품 수 추출 (h2 텍스트: "그래픽카드 (725)")
  const totalCountText = await page.$eval('h2', (el) => el.innerText).catch(() => '');
  const totalMatch = totalCountText.match(/\((\d[\d,]*)\)/);
  const expectedTotal = totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : 0;
  const totalPages = expectedTotal > 0 ? Math.ceil(expectedTotal / ITEMS_PER_PAGE) : 1;
  console.log(`  📊 총 상품 수: ${expectedTotal || '확인 불가'}, 총 페이지: ${totalPages}`);

  // MediumDivNo 추출 (URL에서)
  const mediumDivMatch = brand.listUrl.match(/MediumDivNo=(\d+)/);
  const mediumDivNo = mediumDivMatch ? mediumDivMatch[1] : '1';

  let allProducts = [];
  const seenNos = new Set();

  for (let pg = 1; pg <= totalPages; pg++) {
    console.log(`    📄 ${pg}/${totalPages} 페이지 수집 중...`);

    if (pg > 1) {
      const offset = (pg - 1) * ITEMS_PER_PAGE;
      await page.evaluate(({ pageNum, os }) => {
        if (typeof GotoPage === 'function') GotoPage(document.global_form, pageNum, os);
      }, { pageNum: pg, os: offset });

      // 페이지 이동 후 상품 리스트 갱신 대기
      await page.waitForTimeout(2000);
      await page.waitForSelector('ul#product_list_ul > li.li-obj', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1000);
    }

    // 혜택가(.custom_price_inner)가 로그인 후 AJAX로 렌더링될 때까지 대기
    await page.waitForSelector('.custom_price_inner', { timeout: 8000 }).catch(() => {
      console.log(`    ⚠ 혜택가 요소 미감지 – 로그인 상태 또는 페이지 구조 확인 필요`);
    });
    await page.waitForTimeout(1000);

    // 스크롤로 현재 페이지 상품 모두 로드 (lazy load 대비)
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    const pageProducts = await extractProductsOnPage(page, mediumDivNo);
    let newCount = 0;
    for (const p of pageProducts) {
      if (!seenNos.has(p.productNo)) {
        seenNos.add(p.productNo);
        allProducts.push(p);
        newCount++;
      }
    }
    console.log(`    ✅ ${pageProducts.length}개 추출 (신규: ${newCount}개, 누계: ${allProducts.length}개)`);
  }

  console.log(`  🏁 [${brand.id}] 전체 ${allProducts.length}개 상품 수집 완료\n`);
  return allProducts;
}

// ─────────────────────────────────────────────
// 4-2. 리스트 페이지에서 상품 목록 수집 (페이지네이션 포함) – 추천/프리미엄 PC용
// ─────────────────────────────────────────────
async function scrapeListPages(page, brand) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  📦 [${brand.id}] 리스트 수집 시작`);
  console.log(`${'═'.repeat(60)}`);

  await page.goto(brand.listUrl, { waitUntil: 'networkidle', timeout: 60000 });

  // ★ 폴백 대기: waitForSelector 실패 시 추가 대기 후 재시도
  let listFound = false;
  try {
    await page.waitForSelector('#recom_search_ul > li', { timeout: 15000 });
    listFound = true;
  } catch {
    console.log(`  ⚠ [${brand.id}] 첫 번째 대기 실패, 5초 추가 대기 후 재시도...`);
    await page.waitForTimeout(5000);
    try {
      await page.waitForSelector('#recom_search_ul > li', { timeout: 10000 });
      listFound = true;
    } catch {
      console.log(`  ❌ [${brand.id}] 리스트 요소 최종 미발견`);
    }
  }
  await page.waitForTimeout(3000);

  if (!listFound) {
    console.log(`  ⚠ [${brand.id}] 상품 리스트를 찾을 수 없습니다. 건너뜁니다.`);
    return [];
  }

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
// 5. 상세 페이지 부품 스크래핑 (공통 로직 + 진행률 업데이트)
// ─────────────────────────────────────────────
async function scrapeDetailComponents(page, products, brandId, brandIdx, totalBrands) {
  console.log(`  🔧 [${brandId}] 상세 부품 스크래핑 시작 (${products.length}개)...`);

  for (let i = 0; i < products.length; i++) {
    const item = products[i];
    console.log(`    [${i + 1}/${products.length}] ${item.name}`);

    // 진행률 계산: 브랜드 단위 진척 + 상품 단위 세부 진척
    const brandWeight = 100 / totalBrands;
    const itemProgress = ((i + 1) / products.length) * brandWeight;
    const overallPercent = Math.round((brandIdx * brandWeight) + itemProgress);

    // 5건마다 Firestore 진행률 업데이트 (너무 빈번한 업데이트 방지)
    if (i % 5 === 0 || i === products.length - 1) {
      await updateProgress(
        'running',
        Math.min(overallPercent, 99),
        `[${brandId}] ${i + 1}/${products.length} 상세 수집 중...`
      );
    }

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
  // 특정 브랜드만 크롤링하는 옵션 (환경변수 CRAWL_BRAND)
  const targetBrand = (process.env.CRAWL_BRAND || '').trim();
  const activeBrands = targetBrand
    ? BRANDS.filter((b) => b.id === targetBrand)
    : BRANDS;

  if (targetBrand && activeBrands.length === 0) {
    console.log(`❌ 브랜드 "${targetBrand}"를 찾을 수 없습니다. 가능한 값: ${BRANDS.map(b => b.id).join(', ')}`);
    process.exit(1);
  }

  const modeLabel = targetBrand ? `[${targetBrand}] 단일 크롤링` : '전체 크롤링';
  await updateProgress('running', 0, `${modeLabel} 시작 중...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  const todayStr = getTodayDateString();

  try {
    // 로그인이 필요한 브랜드가 있는지 확인하고 미리 로그인
    const needsLogin = activeBrands.some((b) => b.requiresLogin);
    if (needsLogin) {
      await updateProgress('running', 0, '컴퓨존 로그인 중...');
      const loginOk = await loginToCompuzone(page);
      if (!loginOk) {
        console.log('  ⚠ 로그인 실패 – 로그인 필요 브랜드는 건너뜁니다.');
      }
    }

    for (let brandIdx = 0; brandIdx < activeBrands.length; brandIdx++) {
      const brand = activeBrands[brandIdx];

      // 로그인 필요한데 로그인 안 된 경우 건너뛰기
      if (brand.requiresLogin && !isLoggedIn) {
        console.log(`  ⚠ [${brand.id}] 로그인 필요 – 건너뜁니다.`);
        continue;
      }

      await updateProgress(
        'running',
        Math.round((brandIdx / activeBrands.length) * 100),
        `[${brand.id}] 리스트 수집 중...`
      );

      // 1단계: 리스트 수집 (타입에 따라 분기)
      let products;
      if (brand.type === 'product_list') {
        products = await scrapeProductListPages(page, brand);
      } else {
        products = await scrapeListPages(page, brand);
      }

      if (products.length === 0) {
        console.log(`  ⚠ [${brand.id}] 상품 0개 – 건너뜁니다.`);
        continue;
      }

      // 2단계: 상세 부품 스크래핑 (recom 타입만 – 부품 리스트는 개별 상품이므로 불필요)
      if (brand.type !== 'product_list') {
        await scrapeDetailComponents(page, products, brand.id, brandIdx, activeBrands.length);
      }

      // 3단계: Firestore 저장
      await saveToFirestore(products, brand.id, todayStr);

      console.log(`\n  🏁 [${brand.id}] 완료! ${products.length}건 저장됨.`);

      // 샘플 출력
      if (brand.type === 'product_list') {
        console.log(`\n  📋 [샘플] ${products[0].name}: ${Number(products[0].originalPrice).toLocaleString()}원`);
      } else if ((products[0]?.components || []).length > 0) {
        console.log(`\n  📋 [샘플] ${products[0].name}:`);
        (products[0].components || []).forEach((c) => {
          console.log(`    - [${c.type}] ${c.partName} | ${Number(c.partPrice).toLocaleString()}원 x ${c.quantity}`);
        });
      }
    }

    await updateProgress('done', 100, `${modeLabel} 완료 (${todayStr})`);

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ✅ ${modeLabel} 완료 (${todayStr})`);
    console.log(`${'═'.repeat(60)}`);

  } catch (error) {
    await updateProgress('error', 0, `오류 발생: ${error.message}`);
    console.error('❌ [치명적 에러]:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

trackCompuzone();
