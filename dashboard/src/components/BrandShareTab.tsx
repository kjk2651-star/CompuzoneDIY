'use client';

import { useMemo } from 'react';
import { Container, Title, Text, Stack, Paper, SimpleGrid, Group, RingProgress, Table, Badge } from '@mantine/core';
import { extractBrand, mapTypeToCategory, ParsedProduct, ComponentCategory } from '@/lib/parseComponents';

interface BrandShareTabProps {
    products: ParsedProduct[];
}

// 카테고리별 한글 라벨
const CATEGORY_LABELS: Record<ComponentCategory, string> = {
    cpu: 'CPU',
    cooler: '쿨러',
    mainboard: '메인보드',
    memory: '메모리',
    gpu: '그래픽카드',
    ssd: 'SSD / 저장장치',
    case: '케이스',
    power: '파워',
    etc: '기타',
};

// 카테고리별 색상
const CATEGORY_COLORS: Record<string, string[]> = {
    cpu: ['blue', 'cyan', 'indigo', 'violet', 'grape', 'teal', 'lime'],
    cooler: ['teal', 'cyan', 'blue', 'indigo', 'green', 'violet', 'grape'],
    mainboard: ['indigo', 'blue', 'cyan', 'teal', 'violet', 'grape', 'lime'],
    memory: ['grape', 'violet', 'indigo', 'blue', 'cyan', 'teal', 'lime'],
    gpu: ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'violet'],
    ssd: ['orange', 'yellow', 'lime', 'green', 'teal', 'cyan', 'blue'],
    case: ['green', 'teal', 'cyan', 'blue', 'indigo', 'violet', 'lime'],
    power: ['yellow', 'orange', 'red', 'pink', 'grape', 'violet', 'lime'],
};

interface BrandShare {
    brand: string;
    count: number;
    ratio: number;
    color: string;
}

/**
 * 카테고리별 브랜드 점유율을 표시하는 탭 컴포넌트
 */
export function BrandShareTab({ products }: BrandShareTabProps) {
    // 카테고리별 브랜드 점유율 계산
    const shareData = useMemo(() => {
        const categoryBrands: Record<string, Record<string, number>> = {};

        // 분석 대상 카테고리
        const targetCategories: ComponentCategory[] = ['cpu', 'cooler', 'mainboard', 'memory', 'gpu', 'ssd', 'case', 'power'];

        targetCategories.forEach((cat) => {
            categoryBrands[cat] = {};
        });

        products.forEach((product) => {
            (product.components || []).forEach((comp) => {
                const category = mapTypeToCategory(comp.type);
                if (!targetCategories.includes(category)) return;

                const brand = extractBrand(comp.partName);
                if (!categoryBrands[category]) categoryBrands[category] = {};
                categoryBrands[category][brand] = (categoryBrands[category][brand] || 0) + 1;
            });
        });

        // 각 카테고리별 점유율 계산
        const result: Record<string, BrandShare[]> = {};

        targetCategories.forEach((cat) => {
            const brands = categoryBrands[cat] || {};
            const total = Object.values(brands).reduce((s, c) => s + c, 0);
            if (total === 0) return;

            const colors = CATEGORY_COLORS[cat] || ['gray'];
            const shares: BrandShare[] = Object.entries(brands)
                .map(([brand, count], idx) => ({
                    brand,
                    count,
                    ratio: Math.round((count / total) * 100),
                    color: colors[idx % colors.length],
                }))
                .sort((a, b) => b.count - a.count);

            result[cat] = shares;
        });

        return result;
    }, [products]);

    const categories = Object.keys(shareData);

    if (categories.length === 0) {
        return (
            <Paper p="xl" withBorder radius="md">
                <Text c="dimmed" ta="center">부품 데이터가 없어 점유율을 분석할 수 없습니다.</Text>
            </Paper>
        );
    }

    return (
        <Stack gap="lg">
            <Paper p="lg" radius="md" withBorder style={{
                background: 'linear-gradient(135deg, var(--mantine-color-grape-filled) 0%, var(--mantine-color-violet-filled) 100%)',
                color: 'white'
            }}>
                <Title order={3} fw={800}>📊 브랜드 점유율 분석</Title>
                <Text size="sm" opacity={0.8}>각 부품 카테고리별 브랜드 채택 비율 (현재 조회 날짜 기준)</Text>
            </Paper>

            <SimpleGrid cols={{ base: 1, sm: 2, lg: 2 }} spacing="lg">
                {categories.map((cat) => {
                    const shares = shareData[cat];
                    const label = CATEGORY_LABELS[cat as ComponentCategory] || cat;

                    return (
                        <Paper key={cat} p="md" withBorder radius="md">
                            <Group justify="space-between" mb="md">
                                <Title order={5}>{label}</Title>
                                <Badge variant="light" color="gray" size="sm">
                                    총 {shares.reduce((s, item) => s + item.count, 0)}건
                                </Badge>
                            </Group>

                            <Group align="flex-start" gap="xl">
                                {/* 링 차트 */}
                                <RingProgress
                                    size={120}
                                    thickness={14}
                                    roundCaps
                                    sections={shares.map((s) => ({
                                        value: s.ratio,
                                        color: `var(--mantine-color-${s.color}-6)`,
                                        tooltip: `${s.brand}: ${s.ratio}%`,
                                    }))}
                                />

                                {/* 상세 테이블 */}
                                <Table verticalSpacing={4} fz="xs" style={{ flex: 1 }}>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>브랜드</Table.Th>
                                            <Table.Th ta="right">수량</Table.Th>
                                            <Table.Th ta="right">비율</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {shares.map((s) => (
                                            <Table.Tr key={s.brand}>
                                                <Table.Td>
                                                    <Group gap={6}>
                                                        <div style={{
                                                            width: 10,
                                                            height: 10,
                                                            borderRadius: 2,
                                                            backgroundColor: `var(--mantine-color-${s.color}-6)`,
                                                        }} />
                                                        <Text size="xs" fw={600}>{s.brand}</Text>
                                                    </Group>
                                                </Table.Td>
                                                <Table.Td ta="right">{s.count}</Table.Td>
                                                <Table.Td ta="right">
                                                    <Badge
                                                        variant="light"
                                                        color={s.color}
                                                        size="sm"
                                                    >
                                                        {s.ratio}%
                                                    </Badge>
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Group>
                        </Paper>
                    );
                })}
            </SimpleGrid>
        </Stack>
    );
}
