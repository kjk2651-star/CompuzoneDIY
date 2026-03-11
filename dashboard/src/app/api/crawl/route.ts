import { NextRequest, NextResponse } from 'next/server';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPO_OWNER = process.env.GITHUB_OWNER || '';
const REPO_NAME = process.env.GITHUB_REPO || '';
const WORKFLOW_FILE = 'scraper.yml';

export async function POST(request: NextRequest) {
    try {
        const { brand } = await request.json();

        if (!GITHUB_TOKEN || !REPO_OWNER || !REPO_NAME) {
            return NextResponse.json(
                { error: 'GitHub 설정이 되어있지 않습니다. (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO)' },
                { status: 500 }
            );
        }

        // GitHub Actions workflow_dispatch 트리거
        const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/dispatches`;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ref: 'main',
                inputs: { brand: brand || '' },
            }),
        });

        if (res.status === 204) {
            return NextResponse.json({
                success: true,
                message: brand ? `[${brand}] 크롤링이 시작되었습니다.` : '전체 크롤링이 시작되었습니다.',
            });
        }

        const errorText = await res.text();
        return NextResponse.json(
            { error: `GitHub API 오류 (${res.status}): ${errorText}` },
            { status: res.status }
        );
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
