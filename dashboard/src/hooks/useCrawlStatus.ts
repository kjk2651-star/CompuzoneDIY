'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export interface CrawlStatus {
    status: 'running' | 'done' | 'error' | 'idle';
    percent: number;
    detail: string;
}

/**
 * Firestore의 crawl_status/latest 문서를 실시간 구독하여
 * 크롤링 진행률을 반환하는 훅.
 */
export function useCrawlStatus() {
    const [crawlStatus, setCrawlStatus] = useState<CrawlStatus>({
        status: 'idle',
        percent: 0,
        detail: '',
    });

    useEffect(() => {
        const docRef = doc(db, 'crawl_status', 'latest');

        const unsubscribe = onSnapshot(
            docRef,
            (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    setCrawlStatus({
                        status: data?.status || 'idle',
                        percent: Number(data?.percent) || 0,
                        detail: data?.detail || '',
                    });
                }
            },
            (err) => {
                console.error('크롤링 상태 구독 오류:', err);
            }
        );

        return () => unsubscribe();
    }, []);

    return crawlStatus;
}
