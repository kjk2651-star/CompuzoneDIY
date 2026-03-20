'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { normalizeType } from '@/lib/specMatcher';

export interface CzComponent {
  type: string;       // 정규화된 타입 (CPU, 쿨러, 메인보드 등)
  partName: string;
  partPrice: number;
  quantity: number;   // 수량 (RAM 2개 등)
  productName: string; // 소속 제품명
  detailUrl: string;  // 소속 제품 상세 URL
  brand: string;       // 프리미엄PC / 추천조립PC / 아이웍스
}

const RECOM_BRANDS = ['프리미엄PC', '추천조립PC', '아이웍스'];

export function useAllRecomComponents() {
  const [components, setComponents] = useState<CzComponent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        // 최신 날짜 조회
        const datesSnap = await getDocs(collection(db, 'compuzone_prices'));
        const dates = datesSnap.docs
          .map((d) => d.id)
          .filter((id) => /^\d{4}-\d{2}-\d{2}$/.test(id))
          .sort()
          .reverse();

        if (dates.length === 0 || cancelled) {
          setLoading(false);
          return;
        }

        const latestDate = dates[0];
        const allComponents: CzComponent[] = [];

        // 3개 브랜드 병렬 조회
        const results = await Promise.all(
          RECOM_BRANDS.map((brand) =>
            getDocs(collection(db, `compuzone_prices/${latestDate}/${brand}`))
          )
        );

        results.forEach((snap, idx) => {
          const brand = RECOM_BRANDS[idx];
          snap.docs.forEach((doc) => {
            const data = doc.data();
            const comps = data.components || [];
            comps.forEach((c: { type?: string; partName?: string; partPrice?: number; quantity?: number }) => {
              const normalizedType = normalizeType(c.type || '');
              if (!normalizedType) return;
              allComponents.push({
                type: normalizedType,
                partName: c.partName || '',
                partPrice: Number(c.partPrice) || 0,
                quantity: Number(c.quantity) || 1,
                productName: data.name || '',
                detailUrl: data.detailUrl || '',
                brand,
              });
            });
          });
        });

        if (!cancelled) {
          setComponents(allComponents);
          setLoading(false);
        }
      } catch (err) {
        console.error('컴퓨존 부품 데이터 조회 실패:', err);
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, []);

  return { components, loading };
}
