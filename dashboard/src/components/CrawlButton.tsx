'use client';

import { useState } from 'react';
import { Button, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';

interface CrawlButtonProps {
    brandId: string;
}

export function CrawlButton({ brandId }: CrawlButtonProps) {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const handleCrawl = async () => {
        if (loading) return;
        setLoading(true);
        setMessage('');

        try {
            const res = await fetch('/api/crawl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ brand: brandId }),
            });
            const data = await res.json();

            if (data.success) {
                setMessage(data.message);
            } else {
                setMessage(`오류: ${data.error}`);
            }
        } catch (e: any) {
            setMessage(`요청 실패: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Tooltip label={message || `${brandId} 크롤링 실행`} opened={message ? true : undefined}>
            <Button
                variant="light"
                color="orange"
                size="xs"
                leftSection={<IconRefresh size={14} />}
                onClick={handleCrawl}
                loading={loading}
            >
                크롤링 실행
            </Button>
        </Tooltip>
    );
}
