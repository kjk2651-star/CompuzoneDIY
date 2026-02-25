'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

interface PricePoint {
    date: string;
    price: number;
}

/**
 * 특정 상품의 일자별 가격 변동 데이터를 조회.
 * 모든 날짜의 해당 brandId 서브컬렉션에서 productNo를 찾아 가격을 수집.
 */
export function usePriceHistory(
    productNo: string,
    brandId: string,
    availableDates: string[]
) {
    const [history, setHistory] = useState<PricePoint[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!productNo || !brandId || availableDates.length === 0) return;

        let cancelled = false;
        setLoading(true);

        async function fetchHistory() {
            const results: PricePoint[] = [];

            // 날짜 오름차순 정렬 (차트 X축)
            const sortedDates = [...availableDates].sort((a, b) => a.localeCompare(b));

            // 병렬 조회 (최대 30일치만 조회하여 성능 보호)
            const recentDates = sortedDates.slice(-30);

            const promises = recentDates.map(async (date) => {
                try {
                    const colRef = collection(db, 'compuzone_prices', date, brandId);
                    const snapshot = await getDocs(colRef);
                    const doc = snapshot.docs.find((d) => d.id === productNo);
                    if (doc) {
                        const data = doc.data();
                        const price = Number(data?.discountPrice ?? data?.originalPrice ?? 0);
                        if (price > 0) {
                            results.push({ date, price });
                        }
                    }
                } catch (e) {
                    // 해당 날짜에 데이터가 없으면 무시
                }
            });

            await Promise.all(promises);

            if (!cancelled) {
                // 날짜순 정렬
                results.sort((a, b) => a.date.localeCompare(b.date));
                setHistory(results);
                setLoading(false);
            }
        }

        fetchHistory();

        return () => {
            cancelled = true;
        };
    }, [productNo, brandId, availableDates]);

    return { history, loading };
}
