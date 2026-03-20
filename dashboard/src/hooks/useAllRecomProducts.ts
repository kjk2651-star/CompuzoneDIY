'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { normalizeType } from '@/lib/specMatcher';

export interface CzProductComponent {
  type: string;      // 정규화된 타입
  partName: string;
  partPrice: number;
  quantity: number;
}

export interface CzProduct {
  productNo: string;
  name: string;
  totalPrice: number; // discountPrice (실판매가)
  detailUrl: string;
  brand: string;
  components: CzProductComponent[];
}

const RECOM_BRANDS = ['프리미엄PC', '추천조립PC', '아이웍스'];

export function useAllRecomProducts() {
  const [products, setProducts] = useState<CzProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const datesSnap = await getDocs(collection(db, 'compuzone_prices'));
        const dates = datesSnap.docs
          .map((d) => d.id)
          .filter((id) => /^\d{4}-\d{2}-\d{2}$/.test(id))
          .sort()
          .reverse();

        if (dates.length === 0 || cancelled) { setLoading(false); return; }

        const latestDate = dates[0];
        const allProducts: CzProduct[] = [];

        const results = await Promise.all(
          RECOM_BRANDS.map((brand) =>
            getDocs(collection(db, `compuzone_prices/${latestDate}/${brand}`))
          )
        );

        results.forEach((snap, idx) => {
          const brand = RECOM_BRANDS[idx];
          snap.docs.forEach((doc) => {
            const data = doc.data();
            const rawComps = data.components || [];
            const components: CzProductComponent[] = rawComps
              .map((c: { type?: string; partName?: string; partPrice?: number; quantity?: number }) => ({
                type: normalizeType(c.type || ''),
                partName: c.partName || '',
                partPrice: Number(c.partPrice) || 0,
                quantity: Number(c.quantity) || 1,
              }))
              .filter((c: CzProductComponent) => c.type);

            allProducts.push({
              productNo: data.productNo || doc.id,
              name: data.name || '',
              totalPrice: Number(data.discountPrice || data.originalPrice) || 0,
              detailUrl: data.detailUrl || '',
              brand,
              components,
            });
          });
        });

        if (!cancelled) {
          setProducts(allProducts);
          setLoading(false);
        }
      } catch (err) {
        console.error('컴퓨존 제품 데이터 조회 실패:', err);
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, []);

  return { products, loading };
}
