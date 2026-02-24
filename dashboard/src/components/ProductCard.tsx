'use client';

import { Card, Image, Text, Badge, Button, Group, Stack, NumberFormatter, Accordion, Table } from '@mantine/core';
import { Product } from '@/hooks/useProducts';
import { IconExternalLink, IconTools } from '@tabler/icons-react';

export function ProductCard({ product }: { product: Product }) {
    const discountRate = Math.round(((product.originalPrice - product.discountPrice) / product.originalPrice) * 100);

    return (
        <Card shadow="sm" padding="lg" radius="md" withBorder h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
            <Card.Section>
                <div style={{ height: 160, background: 'var(--mantine-color-gray-1)', display: 'flex', alignItems: 'center', justifyItems: 'center', position: 'relative' }}>
                    <IconTools size={48} color="var(--mantine-color-gray-4)" style={{ margin: 'auto' }} />
                    {discountRate > 0 && (
                        <Badge color="red" variant="filled" style={{ position: 'absolute', top: 10, right: 10 }}>
                            {discountRate}% OFF
                        </Badge>
                    )}
                </div>
            </Card.Section>

            <Stack mt="md" mb="xs" gap="xs" style={{ flex: 1 }}>
                <Text fw={700} lineClamp={2} h={44}>
                    {product.name}
                </Text>

                <Group justify="space-between" align="flex-end">
                    <Stack gap={0}>
                        {product.originalPrice > product.discountPrice && (
                            <Text size="xs" c="dimmed" td="through-line">
                                <NumberFormatter suffix="원" value={product.originalPrice} thousandSeparator />
                            </Text>
                        )}
                        <Text fw={800} size="xl" c="blue">
                            <NumberFormatter suffix="원" value={product.discountPrice} thousandSeparator />
                        </Text>
                    </Stack>
                </Group>

                <Accordion variant="separated" radius="xs" chevronSize="xs">
                    <Accordion.Item value="components">
                        <Accordion.Control icon={<IconTools size="1rem" color="gray" />}>
                            <Text size="xs" fw={600}>주요 부품 구성 ({product.components?.length || 0})</Text>
                        </Accordion.Control>
                        <Accordion.Panel>
                            <Table verticalSpacing="xs" fz="xs">
                                <Table.Tbody>
                                    {(product.components || []).map((c, i) => (
                                        <Table.Tr key={i}>
                                            <Table.Td fw={700} w={60}>{c.type}</Table.Td>
                                            <Table.Td>{c.partName}</Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Accordion.Panel>
                    </Accordion.Item>
                </Accordion>
            </Stack>

            <Button
                component="a"
                href={product.detailUrl}
                target="_blank"
                variant="light"
                color="blue"
                fullWidth
                mt="md"
                radius="md"
                rightSection={<IconExternalLink size="0.9rem" />}
            >
                상세정보 보기
            </Button>
        </Card>
    );
}
