import { Container, Title, Text, Stack } from '@mantine/core';

export default function Home() {
  return (
    <Container size="xl" py="xl">
      <Stack gap="md">
        <Title order={1}>컴퓨존 프리미엄 PC 대시보드</Title>
        <Text c="dimmed">
          매일 자정 업데이트되는 컴퓨존 프리미엄 PC의 가격과 부품 구성 변동 추이를 확인하세요.
        </Text>
      </Stack>
    </Container>
  );
}
