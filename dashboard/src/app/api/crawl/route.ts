import { NextResponse } from 'next/server';

/**
 * POST /api/crawl
 * GitHub Actions workflow_dispatch API를 호출하여 크롤러를 원격 실행합니다.
 * 로컬 및 Vercel 배포 환경 모두에서 동작합니다.
 *
 * 필요한 환경변수:
 * - GITHUB_PAT: GitHub Personal Access Token (repo 권한 필요)
 */
export async function POST() {
    const githubPat = process.env.GITHUB_PAT;

    // PAT가 설정되지 않은 경우 (로컬 개발 환경 폴백)
    if (!githubPat) {
        // 로컬에서는 child_process 대신 안내 메시지만 반환
        return NextResponse.json({
            success: false,
            error: 'GITHUB_PAT 환경변수가 설정되지 않았습니다. Vercel 환경변수 또는 .env.local에 추가해주세요.',
        }, { status: 400 });
    }

    try {
        // GitHub Actions workflow_dispatch API 호출
        // https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
        const owner = 'kjk2651-star';
        const repo = 'CompuzoneDIY';
        const workflowId = 'scraper.yml';

        const response = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${githubPat}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ref: 'main',
                }),
            }
        );

        if (response.status === 204) {
            // 204 No Content = 성공
            return NextResponse.json({
                success: true,
                message: 'GitHub Actions 크롤링이 시작되었습니다. Actions 탭과 대시보드 진행률에서 확인하세요.',
            });
        } else {
            const errorData = await response.json().catch(() => ({}));
            return NextResponse.json({
                success: false,
                error: `GitHub API 오류 (${response.status}): ${(errorData as any)?.message || '알 수 없는 오류'}`,
            }, { status: response.status });
        }
    } catch (error: any) {
        console.error('GitHub Actions 호출 오류:', error);
        return NextResponse.json(
            { success: false, error: error?.message || '서버 오류' },
            { status: 500 }
        );
    }
}
