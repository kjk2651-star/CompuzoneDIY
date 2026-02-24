import { notFound } from 'next/navigation';
import { BRAND_MAP } from '@/constants/brands';
import { BrandDashboard } from '@/components/BrandDashboard';

interface PageProps {
    params: Promise<{ brand: string }>;
}

export default async function Page({ params }: PageProps) {
    const { brand } = await params;
    const config = BRAND_MAP[brand];

    if (!config) {
        notFound();
    }

    return <BrandDashboard brandId={config.id} brandLabel={config.label} />;
}
