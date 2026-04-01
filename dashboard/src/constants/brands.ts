export const BRAND_MAP: Record<string, { id: string, label: string, type?: 'product_list' }> = {
    'premium-pc': { id: '프리미엄PC', label: '프리미엄PC' },
    'recommend-pc': { id: '추천조립PC', label: '추천조립PC' },
    'iworks': { id: '아이웍스', label: '아이웍스' },
    'gpu': { id: '그래픽카드', label: '그래픽카드', type: 'product_list' },
    'mainboard': { id: '메인보드', label: '메인보드', type: 'product_list' },
    'microsoft': { id: 'Microsoft', label: 'Microsoft', type: 'product_list' },
};
