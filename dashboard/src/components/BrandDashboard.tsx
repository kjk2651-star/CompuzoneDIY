'use client';

import { useState, useMemo, useCallback } from 'react';
import {
    Container, Title, Text, Stack, Group, Paper, Select, Loader, Center,
    Table, TextInput, ActionIcon, Tooltip, Badge, Button, Tabs, ScrollArea,
    NumberFormatter, Progress
} from '@mantine/core';
import {
    IconExternalLink, IconSearch, IconRefresh, IconChartLine,
    IconChartPie, IconDownload
} from '@tabler/icons-react';
import { useProducts } from '@/hooks/useProducts';
import { useAvailableDates } from '@/hooks/useAvailableDates';
import { useCrawlStatus } from '@/hooks/useCrawlStatus';
import { parseProduct, ParsedProduct } from '@/lib/parseComponents';
import { PriceHistoryModal } from './PriceHistoryModal';
import { BrandShareTab } from './BrandShareTab';

interface BrandDashboardProps {
    brandId: string;
    brandLabel: string;
}

export function BrandDashboard({ brandId, brandLabel }: BrandDashboardProps) {
    // 날짜 관련
    const { dates, latestDate, loading: datesLoading } = useAvailableDates();
    const [selectedDate, setSelectedDate] = useState<string>('');
    const activeDate = selectedDate || latestDate;

    // 상품 데이터
    const { products: rawProducts, loading, error } = useProducts(brandId, activeDate);

    // 크롤링 진행률
    const crawlStatus = useCrawlStatus();

    // 필터 상태
    const [filterName, setFilterName] = useState('');
    const [filterCpu, setFilterCpu] = useState('');
    const [filterMainboard, setFilterMainboard] = useState('');
    const [filterGpu, setFilterGpu] = useState('');

    // 가격 변동 모달
    const [modalOpened, setModalOpened] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<ParsedProduct | null>(null);

    // 수동 크롤링 상태
    const [crawling, setCrawling] = useState(false);
    const [crawlResult, setCrawlResult] = useState<string | null>(null);

    // 원본 데이터 파싱
    const parsedProducts = useMemo(() => {
        return rawProducts.map((p) => parseProduct(p));
    }, [rawProducts]);

    // 필터링된 데이터
    const filteredProducts = useMemo(() => {
        return parsedProducts.filter((p) => {
            const matchName = !filterName || p.name.toLowerCase().includes(filterName.toLowerCase());
            const matchCpu = !filterCpu || p.cpu.toLowerCase().includes(filterCpu.toLowerCase());
            const matchMb = !filterMainboard || p.mainboard.toLowerCase().includes(filterMainboard.toLowerCase());
            const matchGpu = !filterGpu || p.gpu.toLowerCase().includes(filterGpu.toLowerCase());
            return matchName && matchCpu && matchMb && matchGpu;
        });
    }, [parsedProducts, filterName, filterCpu, filterMainboard, filterGpu]);

    // 날짜 Select 데이터
    const dateOptions = useMemo(() => {
        return dates.map((d, idx) => ({
            value: d,
            label: idx === 0 ? `${d} (최신)` : d,
        }));
    }, [dates]);

    // 행 클릭 핸들러
    const handleRowClick = (product: ParsedProduct) => {
        setSelectedProduct(product);
        setModalOpened(true);
    };

    // 수동 크롤링 실행
    const handleManualCrawl = async () => {
        setCrawling(true);
        setCrawlResult(null);
        try {
            const res = await fetch('/api/crawl', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                setCrawlResult('✅ 크롤링이 시작되었습니다. 아래 진행률을 확인하세요.');
            } else {
                setCrawlResult(`❌ 오류: ${data?.error || '알 수 없는 오류'}`);
            }
        } catch (e: any) {
            setCrawlResult(`❌ 요청 실패: ${e?.message || '네트워크 오류'}`);
        } finally {
            setCrawling(false);
        }
    };

    // 엑셀 다운로드
    const handleExcelDownload = useCallback(async () => {
        // 동적 import로 xlsx 로드 (클라이언트 전용)
        const XLSX = await import('xlsx');

        const wsData = filteredProducts.map((p) => ({
            'SKU명': p.name,
            '가격': Number(p.discountPrice || p.originalPrice),
            'CPU': p.cpu || '-',
            '쿨러': p.cooler || '-',
            '메인보드': p.mainboard || '-',
            '메모리': p.memory || '-',
            '그래픽카드': p.gpu || '-',
            'SSD': p.ssd || '-',
            '케이스': p.case_ || '-',
            '파워': p.power || '-',
            '그외 부품': p.etc || '-',
            '상세정보URL': p.detailUrl || '-',
        }));

        const ws = XLSX.utils.json_to_sheet(wsData);

        // 컬럼 너비 자동 조절
        const colWidths = Object.keys(wsData[0] || {}).map((key) => {
            const maxLen = Math.max(
                key.length,
                ...wsData.map((row) => String((row as any)[key] || '').length)
            );
            return { wch: Math.min(maxLen + 2, 50) };
        });
        ws['!cols'] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, brandLabel);
        XLSX.writeFile(wb, `${brandLabel}_${activeDate}.xlsx`);
    }, [filteredProducts, brandLabel, activeDate]);

    // 부품 텍스트 줄임 처리
    const truncate = (text: string, maxLen: number = 30) => {
        if (!text) return '-';
        return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
    };

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
                            <Title order={2} fw={900}>{brandLabel} 실시간 모니터링</Title>
                            <Text size="sm" opacity={0.8}>
                                {activeDate ? `${activeDate} 기준` : '데이터 로딩 중...'} · {filteredProducts.length}개 상품
                            </Text>
                        </Stack>

                        <Group gap="sm" wrap="wrap">
                            <Select
                                placeholder="날짜 선택"
                                value={activeDate}
                                onChange={(val) => setSelectedDate(val || '')}
                                data={dateOptions}
                                size="sm"
                                w={180}
                                styles={{
                                    input: {
                                        backgroundColor: 'rgba(255,255,255,0.15)',
                                        color: 'white',
                                        border: '1px solid rgba(255,255,255,0.3)',
                                    },
                                }}
                                disabled={datesLoading}
                            />

                            <Tooltip label="즉시 크롤링 실행">
                                <Button
                                    variant="white"
                                    color="blue"
                                    size="sm"
                                    leftSection={<IconRefresh size={16} />}
                                    onClick={handleManualCrawl}
                                    loading={crawling}
                                >
                                    수동 수집
                                </Button>
                            </Tooltip>
                        </Group>
                    </Group>

                    {crawlResult && (
                        <Text size="xs" mt="xs" opacity={0.9}>{crawlResult}</Text>
                    )}

                    {/* 크롤링 진행률 표시 */}
                    {crawlStatus.status === 'running' && (
                        <Stack gap={4} mt="sm">
                            <Group justify="space-between">
                                <Text size="xs" opacity={0.9}>🔄 {crawlStatus.detail}</Text>
                                <Text size="xs" fw={700}>{crawlStatus.percent}%</Text>
                            </Group>
                            <Progress
                                value={crawlStatus.percent}
                                color="white"
                                size="sm"
                                radius="xl"
                                animated
                                styles={{
                                    root: { backgroundColor: 'rgba(255,255,255,0.2)' },
                                    section: { backgroundColor: 'white' },
                                }}
                            />
                        </Stack>
                    )}

                    {crawlStatus.status === 'done' && (
                        <Text size="xs" mt="xs" c="white" opacity={0.9}>
                            ✅ {crawlStatus.detail}
                        </Text>
                    )}

                    {crawlStatus.status === 'error' && (
                        <Text size="xs" mt="xs" c="yellow" opacity={0.9}>
                            ⚠ {crawlStatus.detail}
                        </Text>
                    )}
                </Paper>

                {/* 탭: 상품목록 / 점유율 */}
                <Tabs defaultValue="products">
                    <Tabs.List>
                        <Tabs.Tab value="products" leftSection={<IconChartLine size={16} />}>
                            상품 목록
                        </Tabs.Tab>
                        <Tabs.Tab value="share" leftSection={<IconChartPie size={16} />}>
                            브랜드 점유율
                        </Tabs.Tab>
                    </Tabs.List>

                    {/* === 상품 테이블 탭 === */}
                    <Tabs.Panel value="products" pt="md">
                        {loading ? (
                            <Center py={100}>
                                <Stack align="center">
                                    <Loader color="blue" size="xl" type="bars" />
                                    <Text c="dimmed" size="sm">Firestore 데이터 불러오는 중...</Text>
                                </Stack>
                            </Center>
                        ) : error ? (
                            <Center py={100}>
                                <Text c="red">데이터 로드 중 오류: {error.message}</Text>
                            </Center>
                        ) : parsedProducts.length === 0 ? (
                            <Center py={100}>
                                <Stack align="center">
                                    <Text size="lg" fw={700}>해당 날짜에 데이터가 없습니다.</Text>
                                    <Text c="dimmed">크롤러가 수집을 완료하면 데이터가 표시됩니다.</Text>
                                </Stack>
                            </Center>
                        ) : (
                            <Stack gap="md">
                                {/* 필터 행 + 엑셀 다운로드 */}
                                <Paper p="sm" withBorder radius="md">
                                    <Group gap="sm" wrap="wrap">
                                        <TextInput
                                            placeholder="SKU명 검색"
                                            leftSection={<IconSearch size={14} />}
                                            size="xs"
                                            value={filterName}
                                            onChange={(e) => setFilterName(e.currentTarget.value)}
                                            style={{ flex: 1, minWidth: 150 }}
                                        />
                                        <TextInput
                                            placeholder="CPU 필터"
                                            size="xs"
                                            value={filterCpu}
                                            onChange={(e) => setFilterCpu(e.currentTarget.value)}
                                            style={{ flex: 1, minWidth: 120 }}
                                        />
                                        <TextInput
                                            placeholder="메인보드 필터"
                                            size="xs"
                                            value={filterMainboard}
                                            onChange={(e) => setFilterMainboard(e.currentTarget.value)}
                                            style={{ flex: 1, minWidth: 120 }}
                                        />
                                        <TextInput
                                            placeholder="그래픽카드 필터"
                                            size="xs"
                                            value={filterGpu}
                                            onChange={(e) => setFilterGpu(e.currentTarget.value)}
                                            style={{ flex: 1, minWidth: 120 }}
                                        />
                                        <Badge variant="light" color="blue" size="lg">
                                            {filteredProducts.length} / {parsedProducts.length}
                                        </Badge>

                                        <Tooltip label="현재 필터 결과를 엑셀로 다운로드">
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

                                {/* 테이블 */}
                                <ScrollArea>
                                    <Table striped highlightOnHover withTableBorder withColumnBorders fz="xs">
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th style={{ minWidth: 200 }}>SKU명</Table.Th>
                                                <Table.Th style={{ minWidth: 90 }} ta="right">가격</Table.Th>
                                                <Table.Th style={{ minWidth: 140 }}>CPU</Table.Th>
                                                <Table.Th style={{ minWidth: 100 }}>쿨러</Table.Th>
                                                <Table.Th style={{ minWidth: 140 }}>메인보드</Table.Th>
                                                <Table.Th style={{ minWidth: 100 }}>메모리</Table.Th>
                                                <Table.Th style={{ minWidth: 140 }}>그래픽카드</Table.Th>
                                                <Table.Th style={{ minWidth: 100 }}>SSD</Table.Th>
                                                <Table.Th style={{ minWidth: 100 }}>케이스</Table.Th>
                                                <Table.Th style={{ minWidth: 100 }}>파워</Table.Th>
                                                <Table.Th style={{ minWidth: 100 }}>그외 부품</Table.Th>
                                                <Table.Th style={{ minWidth: 70 }} ta="center">상세</Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {filteredProducts.map((product) => (
                                                <Table.Tr
                                                    key={product.productNo}
                                                    style={{ cursor: 'pointer' }}
                                                    onClick={() => handleRowClick(product)}
                                                >
                                                    <Table.Td>
                                                        <Tooltip label={product.name} multiline w={300}>
                                                            <Text size="xs" fw={600} lineClamp={1}>{product.name}</Text>
                                                        </Tooltip>
                                                    </Table.Td>
                                                    <Table.Td ta="right">
                                                        <Text size="xs" fw={700} c="blue">
                                                            <NumberFormatter
                                                                suffix="원"
                                                                value={product.discountPrice || product.originalPrice}
                                                                thousandSeparator
                                                            />
                                                        </Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Tooltip label={product.cpu || '-'}>
                                                            <Text size="xs" lineClamp={1}>{truncate(product.cpu, 25)}</Text>
                                                        </Tooltip>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Text size="xs" lineClamp={1}>{truncate(product.cooler, 20)}</Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Tooltip label={product.mainboard || '-'}>
                                                            <Text size="xs" lineClamp={1}>{truncate(product.mainboard, 25)}</Text>
                                                        </Tooltip>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Text size="xs" lineClamp={1}>{truncate(product.memory, 20)}</Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Tooltip label={product.gpu || '-'}>
                                                            <Text size="xs" lineClamp={1}>{truncate(product.gpu, 25)}</Text>
                                                        </Tooltip>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Text size="xs" lineClamp={1}>{truncate(product.ssd, 20)}</Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Text size="xs" lineClamp={1}>{truncate(product.case_, 20)}</Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Text size="xs" lineClamp={1}>{truncate(product.power, 20)}</Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Text size="xs" lineClamp={1}>{truncate(product.etc, 20)}</Text>
                                                    </Table.Td>
                                                    <Table.Td ta="center">
                                                        <ActionIcon
                                                            component="a"
                                                            href={product.detailUrl}
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
                    </Tabs.Panel>

                    {/* === 브랜드 점유율 탭 === */}
                    <Tabs.Panel value="share" pt="md">
                        {loading ? (
                            <Center py={100}>
                                <Loader color="grape" size="xl" type="bars" />
                            </Center>
                        ) : (
                            <BrandShareTab products={parsedProducts} />
                        )}
                    </Tabs.Panel>
                </Tabs>
            </Stack>

            {/* 가격 변동 모달 */}
            {selectedProduct && (
                <PriceHistoryModal
                    opened={modalOpened}
                    onClose={() => {
                        setModalOpened(false);
                        setSelectedProduct(null);
                    }}
                    productNo={selectedProduct.productNo}
                    productName={selectedProduct.name}
                    brandId={brandId}
                    availableDates={dates}
                />
            )}
        </Container>
    );
}
