import { Container, Title, Text, Stack, SimpleGrid, Paper, UnstyledButton, Group, ThemeIcon, rem } from '@mantine/core';
import { IconDeviceDesktop, IconShoppingCart, IconBuildingStore, IconChevronRight } from '@tabler/icons-react';
import Link from 'next/link';

const brands = [
  { title: '프리미엄PC', desc: '컴퓨존이 보증하는 고사양 PC 목록', icon: IconDeviceDesktop, color: 'blue', href: '/premium-pc' },
  { title: '추천조립PC', desc: '다양한 견적의 조립 PC 실시간 가격', icon: IconShoppingCart, color: 'teal', href: '/recommend-pc' },
  { title: '아이웍스', desc: '컴퓨존 자체 브랜드 iworks PC 추이', icon: IconBuildingStore, color: 'indigo', href: '/iworks' },
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

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xl">
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
