'use client';

import { Container, Title, Text, Stack, SimpleGrid, Paper, UnstyledButton, Group, ThemeIcon, rem } from '@mantine/core';
import { IconDeviceDesktop, IconShoppingCart, IconBuildingStore, IconChevronRight, IconCpu, IconServer, IconArrowsShuffle, IconBrandWindows, IconReportAnalytics } from '@tabler/icons-react';
import Link from 'next/link';

const brands = [
  { title: '프리미엄PC', desc: '컴퓨존이 보증하는 고사양 PC 목록', icon: IconDeviceDesktop, color: 'blue', href: '/premium-pc' },
  { title: '추천조립PC', desc: '다양한 견적의 조립 PC 실시간 가격', icon: IconShoppingCart, color: 'teal', href: '/recommend-pc' },
  { title: '아이웍스', desc: '컴퓨존 자체 브랜드 iworks PC 추이', icon: IconBuildingStore, color: 'indigo', href: '/iworks' },
  { title: 'CPU', desc: 'CPU 부품 가격 실시간 모니터링', icon: IconCpu, color: 'grape', href: '/cpu' },
  { title: '그래픽카드', desc: '그래픽카드 부품 가격 실시간 모니터링', icon: IconCpu, color: 'red', href: '/gpu' },
  { title: '메인보드', desc: '메인보드 부품 가격 실시간 모니터링', icon: IconServer, color: 'orange', href: '/mainboard' },
  { title: 'Microsoft', desc: 'Microsoft 관련 제품 딜러가 모니터링', icon: IconBrandWindows, color: 'cyan', href: '/microsoft' },
  { title: 'iPC 가격비교', desc: 'iPC 부품과 컴퓨존 조립PC 스펙별 가격 비교', icon: IconArrowsShuffle, color: 'violet', href: '/ipc-compare' },
  { title: 'Summary', desc: '주요 품목 최신가/변동 한눈에 보기', icon: IconReportAnalytics, color: 'yellow', href: '/summary' },
];

export default function Home() {
  return (
    <Container size="xl" py={40}>
      <Stack gap={40}>
        <Stack gap="xs">
          <Title order={1} fw={900} size={rem(42)}>
            컴퓨존 실시간 가격 대시보드
          </Title>
          <Text size="lg" c="dimmed" maw={600}>
            매일 자정에 수집되는 데이터를 바탕으로 컴퓨존 PC의 부품 구성과 가격 변동을 실시간으로 모니터링합니다.
          </Text>
        </Stack>

        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xl">
          {brands.map((brand) => (
            <Paper
              key={brand.title}
              component={Link}
              href={brand.href}
              withBorder
              px="xl"
              py="xl"
              radius="md"
              style={{
                cursor: 'pointer',
                transition: 'transform 200ms ease, box-shadow 200ms ease',
                textDecoration: 'none',
                color: 'inherit'
              }}
              className="brand-card"
            >
              <ThemeIcon variant="light" size={60} radius="md" color={brand.color}>
                <brand.icon size={rem(32)} stroke={1.5} />
              </ThemeIcon>
              <Title order={3} mt="md" mb="xs">
                {brand.title}
              </Title>
              <Text size="sm" c="dimmed" mb="lg">
                {brand.desc}
              </Text>

              <Group justify="flex-end">
                <IconChevronRight size={rem(18)} />
              </Group>
            </Paper>
          ))}
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
