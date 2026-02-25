'use client';

import { Modal, Text, Center, Loader, Stack } from '@mantine/core';
import { LineChart } from '@mantine/charts';
import { usePriceHistory } from '@/hooks/usePriceHistory';

interface PriceHistoryModalProps {
    opened: boolean;
    onClose: () => void;
    productNo: string;
    productName: string;
    brandId: string;
    availableDates: string[];
}

/**
 * 특정 상품의 일자별 가격 변동을 꺾은선 그래프로 표시하는 모달
 */
export function PriceHistoryModal({
    opened,
    onClose,
    productNo,
    productName,
    brandId,
    availableDates,
}: PriceHistoryModalProps) {
    const { history, loading } = usePriceHistory(productNo, brandId, availableDates);

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={<Text fw={700} size="lg">📈 가격 변동 추이</Text>}
            size="xl"
            centered
        >
            <Stack gap="md">
                <Text size="sm" c="dimmed" lineClamp={2}>
                    {productName}
                </Text>

                {loading ? (
                    <Center py={60}>
                        <Loader color="blue" type="bars" />
                    </Center>
                ) : history.length === 0 ? (
                    <Center py={60}>
                        <Text c="dimmed">가격 이력 데이터가 없습니다.</Text>
                    </Center>
                ) : (
                    <LineChart
                        h={350}
                        data={history}
                        dataKey="date"
                        series={[{ name: 'price', label: '판매가', color: 'blue.6' }]}
                        curveType="monotone"
                        connectNulls
                        withLegend
                        withDots
                        valueFormatter={(value) => `${Number(value).toLocaleString()}원`}
                        yAxisProps={{
                            tickFormatter: (value: number) => `${(value / 10000).toFixed(0)}만`,
                        }}
                        xAxisProps={{
                            tickFormatter: (value: string) => {
                                // "2026-02-25" → "02/25"
                                const parts = (value || '').split('-');
                                return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : value;
                            },
                        }}
                    />
                )}
            </Stack>
        </Modal>
    );
}
