'use client';

import { useState, useMemo, useCallback } from 'react';
import {
    Container, Title, Text, Stack, Group, Paper, Loader, Center,
    Table, TextInput, ActionIcon, Tooltip, Badge, Button, ScrollArea,
    NumberFormatter, Modal
} from '@mantine/core';
import { IconExternalLink, IconSearch, IconDownload } from '@tabler/icons-react';
import { LineChart } from '@mantine/charts';
import { useAvailableDates } from '@/hooks/useAvailableDates';
import { useMultiDateProducts, ProductPriceRow } from '@/hooks/useMultiDateProducts';
import { useCrawlStatus } from '@/hooks/useCrawlStatus';
import { CrawlButton } from './CrawlButton';

interface ProductListDashboardProps {
    brandId: string;
    brandLabel: string;
}

export function ProductListDashboard({ brandId, brandLabel }: ProductListDashboardProps) {
    const { dates, loading: datesLoading } = useAvailableDates();
    const { rows, loading } = useMultiDateProducts(brandId, dates);
    const crawlStatus = useCrawlStatus();

    const [filterName, setFilterName] = useState('');
    const [modelNameWidth, setModelNameWidth] = useState(250);

    // 가격 그래프 모달
    const [modalOpened, setModalOpened] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<ProductPriceRow | null>(null);

    // 모델명 컬럼 리사이즈 핸들
    const handleResizeMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = modelNameWidth;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const delta = moveEvent.clientX - startX;
            setModelNameWidth(Math.max(150, startWidth + delta));
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    // 최근 30일 날짜 목록 (최신순 → 역순으로 테이블 헤더에 표시)
    const recentDates = useMemo(() => dates.slice(0, 30), [dates]);

    // 필터링
    const filteredRows = useMemo(() => {
        if (!filterName) return rows;
        const lower = filterName.toLowerCase();
        return rows.filter((r) => r.name.toLowerCase().includes(lower));
    }, [rows, filterName]);

    // 날짜 포맷: "2026-03-10" → "03/10"
    const formatDate = (d: string) => {
        const parts = d.split('-');
        return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : d;
    };

    // 가격 변동 색상
    const getPriceChange = (row: ProductPriceRow, dateIdx: number) => {
        if (dateIdx >= recentDates.length - 1) return null;
        const currentPrice = row.prices[recentDates[dateIdx]];
        const prevPrice = row.prices[recentDates[dateIdx + 1]];
        if (!currentPrice || !prevPrice) return null;
        const diff = currentPrice - prevPrice;
        if (diff > 0) return { color: 'red', symbol: '▲', diff };
        if (diff < 0) return { color: 'blue', symbol: '▼', diff: Math.abs(diff) };
        return null;
    };

    // 행 클릭 → 그래프 모달
    const handleRowClick = (row: ProductPriceRow) => {
        setSelectedProduct(row);
        setModalOpened(true);
    };

    // 그래프 데이터 생성
    const chartData = useMemo(() => {
        if (!selectedProduct) return [];
        return [...recentDates]
            .reverse() // 오래된 날짜부터
            .filter((d) => selectedProduct.prices[d])
            .map((d) => ({
                date: d,
                price: selectedProduct.prices[d],
            }));
    }, [selectedProduct, recentDates]);

    // 엑셀 다운로드
    const handleExcelDownload = useCallback(async () => {
        const XLSX = await import('xlsx');
        const wsData = filteredRows.map((r) => {
            const row: Record<string, any> = { '모델명': r.name };
            recentDates.forEach((d) => {
                row[d] = r.prices[d] || '';
            });
            row['링크'] = r.detailUrl || '';
            return row;
        });

        const ws = XLSX.utils.json_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, brandLabel);
        XLSX.writeFile(wb, `${brandLabel}_가격추이.xlsx`);
    }, [filteredRows, recentDates, brandLabel]);

    return (
        <Container size="xl" py="xl">
            <Stack gap="xl">
                {/* 헤더 */}
                <Paper p="lg" radius="md" withBorder style={{
                    background: 'linear-gradient(135deg, var(--mantine-color-blue-filled) 0%, var(--mantine-color-cyan-filled) 100%)',
                    color: 'white'
                }}>
                    <Group justify="space-between" align="flex-end" wrap="wrap">
                        <Stack gap={0}>
                            <Title order={2} fw={900}>{brandLabel} 가격 모니터링</Title>
                            <Text size="sm" opacity={0.8}>
                                {recentDates[0] ? `최신: ${recentDates[0]}` : '데이터 로딩 중...'} · {filteredRows.length}개 상품 · 최대 {recentDates.length}일 추이
                            </Text>
                        </Stack>
                        <CrawlButton brandId={brandId} />
                    </Group>

                    {crawlStatus.status === 'running' && (
                        <Text size="xs" mt="xs" opacity={0.9}>
                            🔄 {crawlStatus.detail} ({crawlStatus.percent}%)
                        </Text>
                    )}
                </Paper>

                {/* 콘텐츠 */}
                {loading || datesLoading ? (
                    <Center py={100}>
                        <Stack align="center">
                            <Loader color="blue" size="xl" type="bars" />
                            <Text c="dimmed" size="sm">Firestore 데이터 불러오는 중...</Text>
                        </Stack>
                    </Center>
                ) : rows.length === 0 ? (
                    <Center py={100}>
                        <Stack align="center">
                            <Text size="lg" fw={700}>데이터가 없습니다.</Text>
                            <Text c="dimmed">크롤러가 수집을 완료하면 데이터가 표시됩니다.</Text>
                        </Stack>
                    </Center>
                ) : (
                    <Stack gap="md">
                        {/* 필터 + 다운로드 */}
                        <Paper p="sm" withBorder radius="md">
                            <Group gap="sm" wrap="wrap">
                                <TextInput
                                    placeholder="모델명 검색"
                                    leftSection={<IconSearch size={14} />}
                                    size="xs"
                                    value={filterName}
                                    onChange={(e) => setFilterName(e.currentTarget.value)}
                                    style={{ flex: 1, minWidth: 200 }}
                                />
                                <Badge variant="light" color="blue" size="lg">
                                    {filteredRows.length} / {rows.length}
                                </Badge>
                                <Tooltip label="엑셀 다운로드">
                                    <Button
                                        variant="light"
                                        color="green"
                                        size="xs"
                                        leftSection={<IconDownload size={14} />}
                                        onClick={handleExcelDownload}
                                    >
                                        엑셀 다운로드
                                    </Button>
                                </Tooltip>
                            </Group>
                        </Paper>

                        {/* 가격 추이 테이블 */}
                        <ScrollArea>
                            <Table striped highlightOnHover withTableBorder withColumnBorders fz="xs">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th style={{ width: modelNameWidth, position: 'sticky', left: 0, background: 'var(--mantine-color-body)', zIndex: 1, paddingRight: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span>모델명</span>
                                                <div
                                                    onMouseDown={handleResizeMouseDown}
                                                    style={{
                                                        width: '4px',
                                                        height: '20px',
                                                        cursor: 'col-resize',
                                                        userSelect: 'none',
                                                        backgroundColor: '#ccc',
                                                        marginLeft: '4px',
                                                    }}
                                                />
                                            </div>
                                        </Table.Th>
                                        {recentDates.map((d) => (
                                            <Table.Th key={d} ta="right" style={{ minWidth: 90, whiteSpace: 'nowrap' }}>
                                                {formatDate(d)}
                                            </Table.Th>
                                        ))}
                                        <Table.Th ta="center" style={{ minWidth: 50 }}>링크</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {filteredRows.map((row) => (
                                        <Table.Tr
                                            key={row.productNo}
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => handleRowClick(row)}
                                        >
                                            <Table.Td style={{ position: 'sticky', left: 0, background: 'var(--mantine-color-body)', zIndex: 1 }}>
                                                <Tooltip label={row.name} multiline w={400}>
                                                    <Text size="xs" fw={600} lineClamp={1}>{row.name}</Text>
                                                </Tooltip>
                                            </Table.Td>
                                            {recentDates.map((d, idx) => {
                                                const price = row.prices[d];
                                                const change = getPriceChange(row, idx);
                                                return (
                                                    <Table.Td key={d} ta="right">
                                                        {price ? (
                                                            <Stack gap={0}>
                                                                <Text size="xs" fw={600}>
                                                                    <NumberFormatter
                                                                        value={price}
                                                                        thousandSeparator
                                                                    />
                                                                </Text>
                                                                {change && (
                                                                    <Text size="10px" c={change.color} fw={700}>
                                                                        {change.symbol}{change.diff.toLocaleString()}
                                                                    </Text>
                                                                )}
                                                            </Stack>
                                                        ) : (
                                                            <Text size="xs" c="dimmed">-</Text>
                                                        )}
                                                    </Table.Td>
                                                );
                                            })}
                                            <Table.Td ta="center">
                                                <ActionIcon
                                                    component="a"
                                                    href={row.detailUrl}
                                                    target="_blank"
                                                    variant="light"
                                                    color="blue"
                                                    size="sm"
                                                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                                >
                                                    <IconExternalLink size={14} />
                                                </ActionIcon>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </ScrollArea>
                    </Stack>
                )}
            </Stack>

            {/* 가격 변동 그래프 모달 */}
            <Modal
                opened={modalOpened}
                onClose={() => { setModalOpened(false); setSelectedProduct(null); }}
                title={<Text fw={700} size="lg">가격 변동 추이</Text>}
                size="xl"
                centered
            >
                <Stack gap="md">
                    <Text size="sm" c="dimmed" lineClamp={2}>
                        {selectedProduct?.name}
                    </Text>

                    {chartData.length === 0 ? (
                        <Center py={60}>
                            <Text c="dimmed">가격 이력 데이터가 없습니다.</Text>
                        </Center>
                    ) : (
                        <LineChart
                            h={350}
                            data={chartData}
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
                                    const parts = (value || '').split('-');
                                    return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : value;
                                },
                            }}
                        />
                    )}
                </Stack>
            </Modal>
        </Container>
    );
}
