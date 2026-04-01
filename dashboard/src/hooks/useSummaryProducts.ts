'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

const PRODUCT_LIST_BRANDS = ['CPU', '그래픽카드', '메인보드', 'Microsoft'];

export interface SummaryProduct {
    productNo: string;
    name: string;
    brand: string;
    detailUrl: string;
    latestPrice: number;
    prevPrice: number;
    latestDate: string;
    prevDate: string;
}

/**
 * 관심 제품 키워드 목록을 받아, 전체 product_list 브랜드에서
 * 최신 2일치 데이터를 조회하여 매칭되는 제품의 가격/변동을 반환.
 */
export function useSummaryProducts(keywords: string[], availableDates: string[]) {
    const [products, setProducts] = useState<SummaryProduct[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (availableDates.length === 0 || keywords.length === 0) {
            setProducts([]);
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);

        async function fetchAll() {
            // 최신 2일치만 가져오기
            const recentDates = availableDates.slice(0, 2);
            const latestDate = recentDates[0];
            const prevDate = recentDates[1] || '';

            const productMap = new Map<string, SummaryProduct>();

            for (const brandId of PRODUCT_LIST_BRANDS) {
                for (const date of recentDates) {
                    try {
                        const colRef = collection(db, 'compuzone_prices', date, brandId);
                        const snapshot = await getDocs(colRef);
                        snapshot.docs.forEach((doc) => {
                            const data = doc.data();
                            const name = (data.name || '') as string;
                            const productNo = data.productNo || doc.id;
                            const price = Number(data.discountPrice || data.originalPrice || 0);
                            if (!name || price === 0) return;

                            // 키워드 매칭 검사
                            const nameLower = name.toLowerCase();
                            const matched = keywords.some((kw) => nameLower.includes(kw.toLowerCase()));
                            if (!matched) return;

                            const key = `${brandId}__${productNo}`;
                            if (!productMap.has(key)) {
                                productMap.set(key, {
                                    productNo,
                                    name,
                                    brand: brandId,
                                    detailUrl: data.detailUrl || '',
                                    latestPrice: 0,
                                    prevPrice: 0,
                                    latestDate,
                                    prevDate,
                                });
                            }

                            const item = productMap.get(key)!;
                            if (data.name) item.name = data.name;
                            if (data.detailUrl) item.detailUrl = data.detailUrl;

                            if (date === latestDate) {
                                item.latestPrice = price;
                            } else if (date === prevDate) {
                                item.prevPrice = price;
                            }
                        });
                    } catch {
                        // 데이터 없으면 무시
                    }
                }
            }

            if (!cancelled) {
                const result = Array.from(productMap.values()).filter((p) => p.latestPrice > 0);
                result.sort((a, b) => a.name.localeCompare(b.name));
                setProducts(result);
                setLoading(false);
            }
        }

        fetchAll();

        return () => { cancelled = true; };
    }, [keywords, availableDates]);

    return { products, loading };
}
