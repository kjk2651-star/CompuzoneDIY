'use client';

import { useState, useMemo } from 'react';
import {
  Container, Title, Text, Stack, Group, Paper, Table, TextInput,
  NumberInput, Button, Loader, Center, Badge, ScrollArea, Tooltip, Anchor,
} from '@mantine/core';
import { IconArrowsShuffle, IconPlus, IconTrash } from '@tabler/icons-react';
import { useAllRecomProducts, CzProduct, CzProductComponent } from '@/hooks/useAllRecomProducts';
import { isSpecMatch, scoreComponents } from '@/lib/specMatcher';

const FIXED_TYPES = ['CPU', '쿨러', '메인보드', '메모리', '그래픽카드', 'SSD', '케이스', '파워'];

interface IpcInput {
  type: string;
  name: string;
  price: number;
  qty: number;
}

// 비교에 선택된 컴퓨존 PC
interface SelectedPc {
  product: CzProduct;
  score: number;
  maxScore: number;
  compMap: Record<string, CzProductComponent>; // type → component
}

function buildCompMap(product: CzProduct): Record<string, CzProductComponent> {
  const map: Record<string, CzProductComponent> = {};
  for (const c of product.components) {
    if (!map[c.type]) map[c.type] = c; // 같은 타입이 여러 개면 첫 번째
  }
  return map;
}

function PriceDiff({ ipc, cz }: { ipc: number; cz: number }) {
  if (!ipc || !cz) return <Text size="xs" c="dimmed">-</Text>;
  const diff = cz - ipc;
  const pct = ((diff / ipc) * 100).toFixed(1);
  const color = diff > 0 ? 'red' : diff < 0 ? 'blue' : 'gray';
  const sign = diff > 0 ? '+' : '';
  return (
    <Text size="xs" fw={700} c={color}>
      {sign}{diff.toLocaleString()}원 ({sign}{pct}%)
    </Text>
  );
}

export function IpcCompare() {
  const { products, loading } = useAllRecomProducts();

  const [inputs, setInputs] = useState<IpcInput[]>(
    FIXED_TYPES.map((t) => ({ type: t, name: '', price: 0, qty: 1 }))
  );
  const [extras, setExtras] = useState<IpcInput[]>([]);
  const [compared, setCompared] = useState(false);

  const updateInput = (idx: number, field: keyof IpcInput, value: string | number) => {
    setInputs((prev) => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next; });
    setCompared(false);
  };
  const updateExtra = (idx: number, field: keyof IpcInput, value: string | number) => {
    setExtras((prev) => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next; });
    setCompared(false);
  };
  const addExtra = () => setExtras((prev) => [...prev, { type: '그외부품', name: '', price: 0, qty: 1 }]);
  const removeExtra = (idx: number) => setExtras((prev) => prev.filter((_, i) => i !== idx));

  // 실시간 iPC 합계
  const inputTotal = useMemo(
    () => inputs.reduce((s, i) => s + i.price * i.qty, 0) + extras.reduce((s, e) => s + e.price * e.qty, 0),
    [inputs, extras]
  );

  // 핵심 4부품 (CPU, MB, GPU, 메모리) 완전 매칭 확인
  const CORE_TYPES = ['CPU', '메인보드', '그래픽카드', '메모리'];

  // 비교 결과: 컴퓨존 PC 매칭 & 선택
  const { selected, matchedCount, totalCount, matchMode } = useMemo(() => {
    if (!compared) return { selected: [], matchedCount: 0, totalCount: 0, matchMode: '' };

    const filled = inputs.filter((i) => i.name.trim());
    if (filled.length === 0) return { selected: [], matchedCount: 0, totalCount: products.length, matchMode: '' };

    const validProducts = products.filter((p) => p.totalPrice > 0 && p.components.length > 0);

    // ──── Step 1: 핵심 4부품 완전 매칭 시도 ────
    const enteredCores = inputs.filter((i) => CORE_TYPES.includes(i.type) && i.name.trim());

    const coreMatchedProducts = enteredCores.length > 0
      ? validProducts.filter((p) => {
          const compMap = buildCompMap(p);
          for (const inp of enteredCores) {
            const comp = compMap[inp.type];
            if (!comp) return false;
            // coreOnly=true → 메모리 클럭 무시, DDR+GB만 비교
            if (!isSpecMatch(inp.type, inp.name, comp.partName, true)) return false;
            // 메모리는 수량도 동일해야 함
            if (inp.type === '메모리' && inp.qty !== comp.quantity) return false;
          }
          return true;
        })
      : [];

    let pool: typeof validProducts;
    let mode: string;

    if (coreMatchedProducts.length > 0) {
      pool = coreMatchedProducts;
      mode = '정확 매칭';
    } else {
      // ──── Step 2: 폴백 - 가장 유사한 PC (최고 점수) ────
      pool = validProducts;
      mode = '유사 매칭';
    }

    // 각 PC에 전체 점수 부여 (클럭 포함 full matching으로 랭킹)
    const scored = pool.map((p) => {
      const { score, maxScore } = scoreComponents(filled, p.components);
      return { product: p, score, maxScore, compMap: buildCompMap(p) };
    });

    if (mode === '유사 매칭') {
      // 폴백: 최고 점수 그룹만 필터
      const bestScore = Math.max(...scored.map((s) => s.score), 0);
      if (bestScore === 0) return { selected: [], matchedCount: 0, totalCount: products.length, matchMode: mode };
      const filtered = scored.filter((s) => s.score === bestScore);
      return pickThree(filtered, products.length, mode);
    }

    // 정확 매칭: 전체 점수(클럭 등 추가 점수) 내림차순 → 가격 오름차순
    scored.sort((a, b) => b.score - a.score || a.product.totalPrice - b.product.totalPrice);
    return pickThree(scored, products.length, mode);
  }, [compared, inputs, products]);

  function pickThree(
    sorted: SelectedPc[],
    total: number,
    mode: string
  ) {
    const byPrice = [...sorted].sort((a, b) => a.product.totalPrice - b.product.totalPrice);
    const sel: SelectedPc[] = [];
    sel.push(byPrice[0]); // 최저가
    if (byPrice.length > 1) {
      const mid = byPrice[Math.floor((byPrice.length - 1) / 2)];
      if (mid.product.productNo !== sel[0].product.productNo) sel.push(mid);
    }
    if (byPrice.length > 2) {
      const last = byPrice[byPrice.length - 1];
      if (!sel.find((s) => s.product.productNo === last.product.productNo)) sel.push(last);
    }
    return { selected: sel, matchedCount: byPrice.length, totalCount: total, matchMode: mode };
  }

  const ipcTotal = inputs.reduce((s, i) => s + i.price * i.qty, 0) + extras.reduce((s, e) => s + e.price * e.qty, 0);

  // 표시할 행 목록 (고정 타입 + 그외부품)
  const allTypes = [
    ...inputs.filter((i) => i.name.trim() || i.price > 0),
    ...extras.filter((e) => e.name.trim() || e.price > 0),
  ];

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        <Paper p="lg" radius="md" withBorder style={{
          background: 'linear-gradient(135deg, var(--mantine-color-violet-filled) 0%, var(--mantine-color-grape-filled) 100%)',
          color: 'white',
        }}>
          <Title order={2} fw={900}>iPC vs 컴퓨존 가격 비교</Title>
          <Text size="sm" opacity={0.8}>
            iPC 부품을 입력하면 컴퓨존 조립PC(프리미엄/추천/아이웍스) 중 스펙이 가장 유사한 실제 제품과 비교합니다.
          </Text>
        </Paper>

        {loading ? (
          <Center py={100}>
            <Stack align="center">
              <Loader color="violet" size="xl" type="bars" />
              <Text c="dimmed" size="sm">컴퓨존 제품 데이터 로딩 중... ({products.length}건)</Text>
            </Stack>
          </Center>
        ) : (
          <>
            {/* 입력 폼 */}
            <Paper p="md" withBorder radius="md">
              <Stack gap="xs">
                <Text fw={700} size="sm">iPC 부품 입력</Text>
                <Table fz="xs" withTableBorder withColumnBorders>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 90 }}>구분</Table.Th>
                      <Table.Th>부품명 (핵심 스펙 포함)</Table.Th>
                      <Table.Th style={{ width: 130 }}>단가 (원)</Table.Th>
                      <Table.Th style={{ width: 70 }}>수량</Table.Th>
                      <Table.Th style={{ width: 110 }} ta="right">소계</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {inputs.map((inp, idx) => (
                      <Table.Tr key={inp.type}>
                        <Table.Td><Badge variant="light" color="violet" size="sm">{inp.type}</Badge></Table.Td>
                        <Table.Td>
                          <TextInput size="xs" placeholder={getPlaceholder(inp.type)}
                            value={inp.name} onChange={(e) => updateInput(idx, 'name', e.currentTarget.value)} />
                        </Table.Td>
                        <Table.Td>
                          <NumberInput size="xs" min={0} step={1000} thousandSeparator=","
                            value={inp.price || ''} onChange={(v) => updateInput(idx, 'price', Number(v) || 0)} />
                        </Table.Td>
                        <Table.Td>
                          <NumberInput size="xs" min={1} max={10}
                            value={inp.qty} onChange={(v) => updateInput(idx, 'qty', Number(v) || 1)} />
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text size="xs" fw={600}>{inp.price > 0 ? (inp.price * inp.qty).toLocaleString() : '-'}</Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                    {extras.map((ext, idx) => (
                      <Table.Tr key={`extra-${idx}`}>
                        <Table.Td>
                          <TextInput size="xs" placeholder="항목명" value={ext.type}
                            onChange={(e) => updateExtra(idx, 'type', e.currentTarget.value)} />
                        </Table.Td>
                        <Table.Td>
                          <TextInput size="xs" placeholder="부품명" value={ext.name}
                            onChange={(e) => updateExtra(idx, 'name', e.currentTarget.value)} />
                        </Table.Td>
                        <Table.Td>
                          <NumberInput size="xs" min={0} step={1000} thousandSeparator=","
                            value={ext.price || ''} onChange={(v) => updateExtra(idx, 'price', Number(v) || 0)} />
                        </Table.Td>
                        <Table.Td>
                          <NumberInput size="xs" min={1} max={10}
                            value={ext.qty} onChange={(v) => updateExtra(idx, 'qty', Number(v) || 1)} />
                        </Table.Td>
                        <Table.Td ta="right">
                          <Group gap={4} wrap="nowrap" justify="flex-end">
                            <Text size="xs" fw={600}>{ext.price > 0 ? (ext.price * ext.qty).toLocaleString() : '-'}</Text>
                            <Button size="xs" variant="subtle" color="red" px={4} onClick={() => removeExtra(idx)}>
                              <IconTrash size={14} />
                            </Button>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                    {/* 실시간 합계 */}
                    <Table.Tr style={{ background: 'var(--mantine-color-violet-light)' }}>
                      <Table.Td colSpan={4}><Text size="sm" fw={800}>iPC 합계</Text></Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" fw={800} c="violet">
                          {inputTotal > 0 ? inputTotal.toLocaleString() + '원' : '-'}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  </Table.Tbody>
                </Table>
                <Group>
                  <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={addExtra}>
                    그외부품 추가
                  </Button>
                  <Button size="sm" color="violet" leftSection={<IconArrowsShuffle size={16} />}
                    onClick={() => setCompared(true)} ml="auto">
                    비교 분석
                  </Button>
                </Group>
              </Stack>
            </Paper>

            {/* 비교 결과 */}
            {compared && (
              <Paper p="md" withBorder radius="md">
                <Stack gap="sm">
                  {selected.length === 0 ? (
                    <Text c="orange" size="sm">매칭되는 컴퓨존 PC를 찾지 못했습니다. 스펙 입력값을 확인해주세요.</Text>
                  ) : (
                    <>
                      <Group gap="xs">
                        <Text fw={700} size="sm">비교 결과</Text>
                        <Badge variant="light" color="violet" size="sm">
                          [{matchMode}] {totalCount}개 중 {matchedCount}개 PC 발견 (매칭 부품: {selected[0].score}/{selected[0].maxScore})
                        </Badge>
                      </Group>

                      {/* 선택된 PC 정보 */}
                      <Group gap="md" wrap="wrap">
                        {selected.map((s, i) => (
                          <Paper key={s.product.productNo} p="xs" withBorder radius="sm" style={{ flex: 1, minWidth: 200 }}>
                            <Text size="xs" c="dimmed">{['최저가', '중간가', '최고가'][i]}</Text>
                            <Anchor href={s.product.detailUrl} target="_blank" size="xs" fw={700} lineClamp={2}>
                              {s.product.name}
                            </Anchor>
                            <Text size="sm" fw={800} c={['blue', 'teal', 'orange'][i]}>
                              {s.product.totalPrice.toLocaleString()}원
                            </Text>
                            <Text size="xs" c="dimmed">{s.product.brand}</Text>
                          </Paper>
                        ))}
                      </Group>

                      {/* 부품별 비교 테이블 */}
                      <ScrollArea>
                        <Table fz="xs" withTableBorder withColumnBorders striped highlightOnHover>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th style={{ width: 80 }}>구분</Table.Th>
                              <Table.Th colSpan={2} ta="center" style={{ background: 'var(--mantine-color-violet-light)', minWidth: 220 }}>
                                iPC
                              </Table.Th>
                              {selected.map((s, i) => (
                                <Table.Th key={s.product.productNo} colSpan={3} ta="center"
                                  style={{ background: ['var(--mantine-color-blue-light)', 'var(--mantine-color-teal-light)', 'var(--mantine-color-orange-light)'][i], minWidth: 320 }}>
                                  {['컴퓨존 최저가', '컴퓨존 중간가', '컴퓨존 최고가'][i]}
                                </Table.Th>
                              ))}
                            </Table.Tr>
                            <Table.Tr>
                              <Table.Th></Table.Th>
                              <Table.Th style={{ minWidth: 150 }}>부품명</Table.Th>
                              <Table.Th ta="right" style={{ minWidth: 90 }}>가격</Table.Th>
                              {selected.map((s) => (
                                <>
                                  <Table.Th key={`${s.product.productNo}-name`} style={{ minWidth: 180 }}>부품명</Table.Th>
                                  <Table.Th key={`${s.product.productNo}-price`} ta="right" style={{ minWidth: 90 }}>가격</Table.Th>
                                  <Table.Th key={`${s.product.productNo}-diff`} ta="right" style={{ minWidth: 110 }}>차이</Table.Th>
                                </>
                              ))}
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {allTypes.map((inp) => {
                              const ipcPrice = inp.price * inp.qty;
                              return (
                                <Table.Tr key={`${inp.type}-${inp.name}`}>
                                  <Table.Td>
                                    <Badge variant="light" color="violet" size="xs">{inp.type}</Badge>
                                  </Table.Td>
                                  <Table.Td>
                                    <Text size="xs" lineClamp={1}>{inp.name || '-'}</Text>
                                  </Table.Td>
                                  <Table.Td ta="right">
                                    <Text size="xs" fw={600}>
                                      {ipcPrice > 0 ? `${inp.price.toLocaleString()}${inp.qty > 1 ? ` ×${inp.qty}` : ''}` : '-'}
                                    </Text>
                                    {ipcPrice > 0 && inp.qty > 1 && (
                                      <Text size="10px" c="dimmed">{ipcPrice.toLocaleString()}원</Text>
                                    )}
                                  </Table.Td>
                                  {selected.map((s) => {
                                    const comp = s.compMap[inp.type];
                                    const czPrice = comp ? comp.partPrice * comp.quantity : 0;
                                    const matched = comp ? isSpecMatch(inp.type, inp.name, comp.partName) : false;
                                    return (
                                      <>
                                        <Table.Td key={`${s.product.productNo}-${inp.type}-name`}>
                                          {comp ? (
                                            <Tooltip label={comp.partName} multiline w={350}>
                                              <Text size="xs" lineClamp={1}
                                                style={{ color: matched ? undefined : 'var(--mantine-color-dimmed)' }}>
                                                {!matched && '⚠ '}{comp.partName}
                                              </Text>
                                            </Tooltip>
                                          ) : <Text size="xs" c="dimmed">-</Text>}
                                        </Table.Td>
                                        <Table.Td key={`${s.product.productNo}-${inp.type}-price`} ta="right">
                                          <Text size="xs" fw={600}>
                                            {comp ? `${comp.partPrice.toLocaleString()}${comp.quantity > 1 ? ` ×${comp.quantity}` : ''}` : '-'}
                                          </Text>
                                          {comp && comp.quantity > 1 && (
                                            <Text size="10px" c="dimmed">{czPrice.toLocaleString()}원</Text>
                                          )}
                                        </Table.Td>
                                        <Table.Td key={`${s.product.productNo}-${inp.type}-diff`} ta="right">
                                          {ipcPrice && czPrice ? <PriceDiff ipc={ipcPrice} cz={czPrice} /> : <Text size="xs" c="dimmed">-</Text>}
                                        </Table.Td>
                                      </>
                                    );
                                  })}
                                </Table.Tr>
                              );
                            })}
                            {/* 합계 행 - 실제 PC 판매가 기준 */}
                            <Table.Tr style={{ background: 'var(--mantine-color-gray-1)' }}>
                              <Table.Td colSpan={2}><Text size="sm" fw={800}>총 판매가</Text></Table.Td>
                              <Table.Td ta="right"><Text size="sm" fw={800}>{ipcTotal.toLocaleString()}</Text></Table.Td>
                              {selected.map((s) => (
                                <>
                                  <Table.Td key={`total-name-${s.product.productNo}`} colSpan={2} ta="right">
                                    <Text size="sm" fw={800}>{s.product.totalPrice.toLocaleString()}</Text>
                                  </Table.Td>
                                  <Table.Td key={`total-diff-${s.product.productNo}`} ta="right">
                                    <PriceDiff ipc={ipcTotal} cz={s.product.totalPrice} />
                                  </Table.Td>
                                </>
                              ))}
                            </Table.Tr>
                          </Table.Tbody>
                        </Table>
                      </ScrollArea>
                      <Text size="xs" c="dimmed">
                        ⚠ 표시는 iPC 스펙과 다른 부품. 총 판매가는 컴퓨존의 실제 조립PC 판매가격 기준.
                      </Text>
                    </>
                  )}
                </Stack>
              </Paper>
            )}
          </>
        )}
      </Stack>
    </Container>
  );
}

function getPlaceholder(type: string): string {
  switch (type) {
    case 'CPU': return 'ex) AMD 7500F, i7-14700F, 9800X3D';
    case '쿨러': return 'ex) 공냉, 수냉 360, 수냉 240';
    case '메인보드': return 'ex) B650M, Z890E, H610';
    case '메모리': return 'ex) DDR5 PC5-44800 32GB';
    case '그래픽카드': return 'ex) RTX 5070 TI 16GB, RX 9070 XT';
    case 'SSD': return 'ex) M.2 NVMe 1TB, SATA 500GB';
    case '케이스': return 'ex) 미들타워';
    case '파워': return 'ex) 750W GOLD, 850W 브론즈';
    default: return '';
  }
}
