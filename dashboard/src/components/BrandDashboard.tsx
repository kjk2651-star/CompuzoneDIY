'use client';

import { useState } from 'react';
import { Container, Title, Text, SimpleGrid, Loader, Center, Stack, Group, Paper, Select } from '@mantine/core';
import { useProducts } from '@/hooks/useProducts';
import { ProductCard } from './ProductCard';

interface BrandDashboardProps {
    brandId: string;
    brandLabel: string;
}

export function BrandDashboard({ brandId, brandLabel }: BrandDashboardProps) {
    // 오늘 날짜 계산 (KST)
    const getTodayKST = () => {
        const now = new Date();
        const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        return kst.toISOString().split('T')[0];
    };

    const [date, setDate] = useState(getTodayKST());
    const { products, loading, error } = useProducts(brandId, date);

    return (
        <Container size="xl" py="xl">
            <Stack gap="xl">
                <Paper p="lg" radius="md" withBorder style={{
                    background: 'linear-gradient(135deg, var(--mantine-color-blue-filled) 0%, var(--mantine-color-cyan-filled) 100%)',
                    color: 'white'
                }}>
                    <Group justify="space-between" align="center">
                        <Stack gap={0}>
                            <Title order={2} fw={900}>{brandLabel} 실시간 모니터링</Title>
                            <Text size="sm" opacity={0.8}>수집된 부품 정보와 가격 변동 실시간 확인</Text>
                        </Stack>

                        <Select
                            label="조회 날짜"
                            placeholder="날짜 선택"
                            value={date}
                            onChange={(val) => setDate(val || getTodayKST())}
                            data={[
                                { value: getTodayKST(), label: `오늘 (${getTodayKST()})` },
                                // 나중에 Firestore에서 수집된 날짜 목록을 가져와서 채울 수 있습니다.
                            ]}
                            styles={{
                                label: { color: 'white' },
                                input: { backgroundColor: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }
                            }}
                        />
                    </Group>
                </Paper>

                {loading ? (
                    <Center py={100}>
                        <Stack align="center">
                            <Loader color="blue" size="xl" type="bars" />
                            <Text c="dimmed" size="sm">Firestore 데이터 불러오는 중...</Text>
                        </Stack>
                    </Center>
                ) : error ? (
                    <Center py={100}>
                        <Text c="red">데이터 로드 중 오류가 발생했습니다: {error.message}</Text>
                    </Center>
                ) : products.length === 0 ? (
                    <Center py={100}>
                        <Stack align="center">
                            <Text size="lg" fw={700}>해당 날짜에 데이터가 없습니다.</Text>
                            <Text c="dimmed">새벽 자정에 크롤러가 수집을 시작하면 데이터가 나타납니다.</Text>
                        </Stack>
                    </Center>
                ) : (
                    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
                        {products.map((product) => (
                            <ProductCard key={product.productNo} product={product} />
                        ))}
                    </SimpleGrid>
                )}
            </Stack>
        </Container>
    );
}
