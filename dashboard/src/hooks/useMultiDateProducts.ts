'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

export interface ProductPriceRow {
    productNo: string;
    name: string;
    detailUrl: string;
    prices: Record<string, number>; // { '2026-03-10': 350000, '2026-03-09': 355000, ... }
}

/**
 * 여러 날짜에 걸쳐 모든 상품의 가격을 조회하여 피벗 테이블 형태로 반환.
 * 최대 30일치 데이터를 가져옴.
 */
export function useMultiDateProducts(brandId: string, availableDates: string[]) {
    const [rows, setRows] = useState<ProductPriceRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!brandId || availableDates.length === 0) return;

        let cancelled = false;
        setLoading(true);

        async function fetchAll() {
            // 최신 30일만
            const recentDates = availableDates.slice(0, 30);
            const productMap = new Map<string, ProductPriceRow>();

            const promises = recentDates.map(async (date) => {
                try {
                    const colRef = collection(db, 'compuzone_prices', date, brandId);
                    const snapshot = await getDocs(colRef);
                    snapshot.docs.forEach((doc) => {
                        const data = doc.data();
                        const productNo = data.productNo || doc.id;
                        const price = Number(data.discountPrice || data.originalPrice || 0);

                        if (!productMap.has(productNo)) {
                            productMap.set(productNo, {
                                productNo,
                                name: data.name || '',
                                detailUrl: data.detailUrl || '',
                                prices: {},
                            });
                        }

                        const row = productMap.get(productNo)!;
                        // 이름/URL은 최신 데이터로 업데이트
                        if (data.name) row.name = data.name;
                        if (data.detailUrl) row.detailUrl = data.detailUrl;
                        if (price > 0) row.prices[date] = price;
                    });
                } catch (e) {
                    // 해당 날짜에 데이터 없으면 무시
                }
            });

            await Promise.all(promises);

            if (!cancelled) {
                const result = Array.from(productMap.values());
                // 이름순 정렬
                result.sort((a, b) => a.name.localeCompare(b.name));
                setRows(result);
                setLoading(false);
            }
        }

        fetchAll();

        return () => { cancelled = true; };
    }, [brandId, availableDates]);

    return { rows, loading };
}
