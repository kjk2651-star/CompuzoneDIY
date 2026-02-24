'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc } from 'firebase/firestore';

export interface Product {
    productNo: string;
    name: string;
    originalPrice: number;
    discountPrice: number;
    detailUrl: string;
    brand: string;
    updatedAt: any;
    components: {
        type: string;
        partName: string;
        partPrice: number;
        quantity: number;
    }[];
}

export function useProducts(brandId: string, date: string) {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!brandId || !date) return;

        setLoading(true);

        // 구조: compuzone_prices/{날짜}/{브랜드명}/{ProductNo}
        const collectionRef = collection(db, 'compuzone_prices', date, brandId);
        const q = query(collectionRef);

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const items = snapshot.docs.map((doc) => ({
                    ...doc.data(),
                })) as Product[];

                setProducts(items);
                setLoading(false);
            },
            (err) => {
                console.error('Firestore Fetch Error:', err);
                setError(err);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [brandId, date]);

    return { products, loading, error };
}
