import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';

/**
 * POST /api/crawl
 * 수동으로 크롤러를 실행하는 API 엔드포인트.
 * 주의: 이 API는 서버에서 child_process를 통해 crawler.js를 실행합니다.
 * 로컬 개발 환경에서만 동작합니다 (Vercel 배포 시에는 GitHub Actions workflow_dispatch 사용 권장).
 */
export async function POST() {
    try {
        // 프로젝트 루트의 crawler.js 경로 계산
        // dashboard/src/app/api/crawl/route.ts → 5단계 상위 = 프로젝트 루트
        const projectRoot = path.resolve(process.cwd(), '..');
        const crawlerPath = path.join(projectRoot, 'crawler.js');

        return new Promise<NextResponse>((resolve) => {
            // 크롤러를 백그라운드로 실행 (비동기)
            const child = exec(
                `node "${crawlerPath}"`,
                {
                    cwd: projectRoot,
                    timeout: 600000, // 10분 타임아웃
                    env: { ...process.env },
                },
                (error, stdout, stderr) => {
                    if (error) {
                        console.error('크롤러 실행 오류:', error.message);
                        console.error('stderr:', stderr);
                    } else {
                        console.log('크롤러 실행 완료:', stdout.slice(-500));
                    }
                }
            );

            // 즉시 응답 반환 (크롤러는 백그라운드 실행)
            resolve(
                NextResponse.json({
                    success: true,
                    message: '크롤링이 백그라운드에서 시작되었습니다.',
                    pid: child.pid,
                })
            );
        });
    } catch (error: any) {
        console.error('API 오류:', error);
        return NextResponse.json(
            { success: false, error: error?.message || '서버 오류' },
            { status: 500 }
        );
    }
}
