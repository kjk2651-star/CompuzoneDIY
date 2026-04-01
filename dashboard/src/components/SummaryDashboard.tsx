'use client';

import { useState, useEffect, useMemo } from 'react';
import {
    Container, Title, Text, Stack, Group, Paper, Loader, Center,
    Table, TextInput, ActionIcon, Tooltip, Badge, Button, ScrollArea,
    NumberFormatter, CloseButton
} from '@mantine/core';
import { IconPlus, IconSearch, IconStar, IconTrash } from '@tabler/icons-react';
import { useAvailableDates } from '@/hooks/useAvailableDates';
import { useSummaryProducts, SummaryProduct } from '@/hooks/useSummaryProducts';

const STORAGE_KEY = 'compuzone_summary_keywords';

function loadKeywords(): string[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveKeywords(keywords: string[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keywords));
}

export function SummaryDashboard() {
    const { dates, loading: datesLoading } = useAvailableDates();
    const [keywords, setKeywords] = useState<string[]>([]);
    const [newKeyword, setNewKeyword] = useState('');
    const [filterText, setFilterText] = useState('');

    // 클라이언트에서만 localStorage 로드
    useEffect(() => {
        setKeywords(loadKeywords());
    }, []);

    const { products, loading } = useSummaryProducts(keywords, dates);

    const addKeyword = () => {
        const kw = newKeyword.trim();
        if (!kw || keywords.includes(kw)) return;
        const updated = [...keywords, kw];
        setKeywords(updated);
        saveKeywords(updated);
        setNewKeyword('');
    };

    const removeKeyword = (kw: string) => {
        const updated = keywords.filter((k) => k !== kw);
        setKeywords(updated);
        saveKeywords(updated);
    };

    const filteredProducts = useMemo(() => {
        if (!filterText) return products;
        const lower = filterText.toLowerCase();
        return products.filter((p) => p.name.toLowerCase().includes(lower) || p.brand.toLowerCase().includes(lower));
    }, [products, filterText]);

    // 브랜드별 그룹핑
    const groupedByBrand = useMemo(() => {
        const groups: Record<string, SummaryProduct[]> = {};
        for (const p of filteredProducts) {
            if (!groups[p.brand]) groups[p.brand] = [];
            groups[p.brand].push(p);
        }
        return groups;
    }, [filteredProducts]);

    return (
        <Container size="xl" py="xl">
            <Stack gap="xl">
                {/* 헤더 */}
                <Paper p="lg" radius="md" withBorder style={{
                    background: 'linear-gradient(135deg, var(--mantine-color-yellow-filled) 0%, var(--mantine-color-orange-filled) 100%)',
                    color: 'white'
                }}>
                    <Stack gap={0}>
                        <Title order={2} fw={900}>Summary - 주요 품목 가격 현황</Title>
                        <Text size="sm" opacity={0.8}>
                            {dates[0] ? `최신: ${dates[0]}` : '데이터 로딩 중...'} · 관심 키워드 {keywords.length}개 · 매칭 제품 {products.length}개
                        </Text>
                    </Stack>
                </Paper>

                {/* 키워드 관리 */}
                <Paper p="md" withBorder radius="md">
                    <Stack gap="sm">
                        <Text size="sm" fw={700} c="dimmed">관심 제품 키워드 관리</Text>
                        <Group gap="xs">
                            <TextInput
                                placeholder="제품명 키워드 입력 (예: RTX 5090, i9-14900K)"
                                value={newKeyword}
                                onChange={(e) => setNewKeyword(e.currentTarget.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') addKeyword(); }}
                                style={{ flex: 1 }}
                                size="sm"
                            />
                            <Button
                                leftSection={<IconPlus size={14} />}
                                size="sm"
                                onClick={addKeyword}
                                disabled={!newKeyword.trim()}
                            >
                                추가
                            </Button>
                        </Group>
                        {keywords.length > 0 && (
                            <Group gap="xs" wrap="wrap">
                                {keywords.map((kw) => (
                                    <Badge
                                        key={kw}
                                        size="lg"
                                        variant="light"
                                        color="blue"
                                        rightSection={
                                            <CloseButton
                                                size="xs"
                                                variant="transparent"
                                                onClick={() => removeKeyword(kw)}
                                            />
                                        }
                                    >
                                        {kw}
                                    </Badge>
                                ))}
                            </Group>
                        )}
                    </Stack>
                </Paper>

                {/* 로딩 / 빈 상태 */}
                {loading || datesLoading ? (
                    <Center py={100}>
                        <Stack align="center">
                            <Loader color="orange" size="xl" type="bars" />
                            <Text c="dimmed" size="sm">데이터 조회 중...</Text>
                        </Stack>
                    </Center>
                ) : keywords.length === 0 ? (
                    <Center py={100}>
                        <Stack align="center">
                            <IconStar size={48} color="gray" />
                            <Text size="lg" fw={700}>관심 키워드를 등록하세요</Text>
                            <Text c="dimmed" size="sm">제품명에 포함된 키워드를 입력하면 전체 브랜드에서 매칭 제품을 찾아줍니다.</Text>
                        </Stack>
                    </Center>
                ) : products.length === 0 ? (
                    <Center py={100}>
                        <Stack align="center">
                            <Text size="lg" fw={700}>매칭되는 제품이 없습니다.</Text>
                            <Text c="dimmed" size="sm">등록된 키워드와 일치하는 제품이 크롤링 데이터에 없습니다.</Text>
                        </Stack>
                    </Center>
                ) : (
                    <Stack gap="md">
                        {/* 검색 필터 */}
                        <Paper p="sm" withBorder radius="md">
                            <Group gap="sm">
                                <TextInput
                                    placeholder="결과 내 검색"
                                    leftSection={<IconSearch size={14} />}
                                    size="xs"
                                    value={filterText}
                                    onChange={(e) => setFilterText(e.currentTarget.value)}
                                    style={{ flex: 1, minWidth: 200 }}
                                />
                                <Badge variant="light" color="orange" size="lg">
                                    {filteredProducts.length} / {products.length}
                                </Badge>
                            </Group>
                        </Paper>

                        {/* 브랜드별 테이블 */}
                        {Object.entries(groupedByBrand).map(([brand, items]) => (
                            <Paper key={brand} p="md" withBorder radius="md">
                                <Stack gap="sm">
                                    <Group gap="xs">
                                        <Badge variant="filled" color="blue" size="lg">{brand}</Badge>
                                        <Text size="sm" c="dimmed">{items.length}개 제품</Text>
                                    </Group>
                                    <ScrollArea>
                                        <Table striped highlightOnHover withTableBorder withColumnBorders fz="xs">
                                            <Table.Thead>
                                                <Table.Tr>
                                                    <Table.Th style={{ minWidth: 350 }}>제품명</Table.Th>
                                                    <Table.Th ta="right" style={{ minWidth: 110 }}>최신가</Table.Th>
                                                    <Table.Th ta="right" style={{ minWidth: 110 }}>전일가</Table.Th>
                                                    <Table.Th ta="right" style={{ minWidth: 110 }}>변동</Table.Th>
                                                </Table.Tr>
                                            </Table.Thead>
                                            <Table.Tbody>
                                                {items.map((p) => {
                                                    const diff = p.prevPrice > 0 ? p.latestPrice - p.prevPrice : 0;
                                                    const diffColor = diff > 0 ? 'red' : diff < 0 ? 'blue' : 'dimmed';
                                                    const diffSymbol = diff > 0 ? '▲' : diff < 0 ? '▼' : '-';

                                                    return (
                                                        <Table.Tr key={p.productNo}>
                                                            <Table.Td>
                                                                <Tooltip label={p.name} multiline w={400}>
                                                                    <Text size="xs" fw={600} lineClamp={1}>{p.name}</Text>
                                                                </Tooltip>
                                                            </Table.Td>
                                                            <Table.Td ta="right">
                                                                <Text size="xs" fw={700}>
                                                                    <NumberFormatter value={p.latestPrice} thousandSeparator suffix="원" />
                                                                </Text>
                                                            </Table.Td>
                                                            <Table.Td ta="right">
                                                                {p.prevPrice > 0 ? (
                                                                    <Text size="xs" c="dimmed">
                                                                        <NumberFormatter value={p.prevPrice} thousandSeparator suffix="원" />
                                                                    </Text>
                                                                ) : (
                                                                    <Text size="xs" c="dimmed">-</Text>
                                                                )}
                                                            </Table.Td>
                                                            <Table.Td ta="right">
                                                                {diff !== 0 ? (
                                                                    <Text size="xs" fw={700} c={diffColor}>
                                                                        {diffSymbol} <NumberFormatter value={Math.abs(diff)} thousandSeparator />
                                                                    </Text>
                                                                ) : (
                                                                    <Text size="xs" c="dimmed">-</Text>
                                                                )}
                                                            </Table.Td>
                                                        </Table.Tr>
                                                    );
                                                })}
                                            </Table.Tbody>
                                        </Table>
                                    </ScrollArea>
                                </Stack>
                            </Paper>
                        ))}
                    </Stack>
                )}
            </Stack>
        </Container>
    );
}
