'use client';

import { AppShell, Burger, Group, Title, Text, UnstyledButton, Stack, rem, useMantineColorScheme, ActionIcon } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconDeviceDesktop, IconShoppingCart, IconBuildingStore, IconSun, IconMoon } from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import classes from './MainLayout.module.css';

const navData = [
    { link: '/premium-pc', label: '프리미엄PC', icon: IconDeviceDesktop },
    { link: '/recommend-pc', label: '추천조립PC', icon: IconShoppingCart },
    { link: '/iworks', label: '아이웍스', icon: IconBuildingStore },
];

export function MainLayout({ children }: { children: React.ReactNode }) {
    const [opened, { toggle }] = useDisclosure();
    const pathname = usePathname();
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();

    const links = navData.map((item) => (
        <UnstyledButton
            component={Link}
            href={item.link}
            key={item.label}
            className={classes.link}
            data-active={pathname === item.link || undefined}
            onClick={toggle}
        >
            <item.icon className={classes.linkIcon} stroke={1.5} />
            <span>{item.label}</span>
        </UnstyledButton>
    ));

    return (
        <AppShell
            header={{ height: 60 }}
            navbar={{
                width: 300,
                breakpoint: 'sm',
                collapsed: { mobile: !opened },
            }}
            padding="md"
        >
            <AppShell.Header>
                <Group h="100%" px="md" justify="space-between">
                    <Group>
                        <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
                        <Title order={3} fw={900} variant="gradient" gradient={{ from: 'blue', to: 'cyan' }}>
                            Compuzone Tracker
                        </Title>
                    </Group>

                    <ActionIcon
                        variant="default"
                        onClick={() => toggleColorScheme()}
                        size="lg"
                        aria-label="Toggle color scheme"
                    >
                        {colorScheme === 'dark' ? <IconSun size="1.2rem" /> : <IconMoon size="1.2rem" />}
                    </ActionIcon>
                </Group>
            </AppShell.Header>

            <AppShell.Navbar p="md">
                <Stack gap="xs">
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                        Monitoring Brands
                    </Text>
                    {links}
                </Stack>
            </AppShell.Navbar>

            <AppShell.Main>{children}</AppShell.Main>
        </AppShell>
    );
}
