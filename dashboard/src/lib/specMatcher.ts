// 컴퓨존 부품 타입명 → 표준 카테고리 정규화
const TYPE_NORMALIZE: Record<string, string> = {
  'CPU': 'CPU',
  'CPU쿨러': '쿨러', '쿨러': '쿨러',
  '메인보드': '메인보드', '주기판': '메인보드',
  '메모리': '메모리', 'RAM': '메모리',
  '그래픽카드': '그래픽카드', 'VGA': '그래픽카드',
  'SSD': 'SSD', '저장장치': 'SSD', 'HDD': 'SSD',
  '케이스': '케이스',
  '파워': '파워', '파워서플라이': '파워',
};

export function normalizeType(type: string): string {
  return TYPE_NORMALIZE[type] || type;
}

// GPU 정보 추출
function extractGpuInfo(name: string) {
  const upper = name.toUpperCase();
  // TIS를 TI보다 먼저 체크 (greedy 방지)
  const match = upper.match(/\b(RTX|RX)\s*(\d{4})\s*(TIS|TI|SUPER|XT)?\b/);
  if (!match) return null;

  const vramMatch = upper.match(/(\d+)\s*GB/);
  return {
    series: match[1],
    model: match[2],
    suffix: (match[3] || ''),
    vram: vramMatch ? vramMatch[1] + 'GB' : '',
  };
}

/**
 * 두 부품이 스펙 기준으로 매칭되는지 확인
 * @param coreOnly true면 메모리 클럭 비교 생략 (핵심 매칭용)
 */
export function isSpecMatch(type: string, ipcName: string, czName: string, coreOnly = false): boolean {
  const ipcUpper = ipcName.toUpperCase();
  const czUpper = czName.toUpperCase();

  switch (type) {
    case 'CPU': {
      // CPU 모델 번호 추출: 7500F, 9800X3D, 14700F, 265K 등
      const cpuMatch = ipcUpper.match(/\b(\d{3,5}[A-Z]{0,3}\d{0,2}[A-Z]{0,2})\b/);
      if (!cpuMatch) return false;
      // 정확한 모델명 매칭 (265K가 265KF에 매칭되지 않도록)
      const regex = new RegExp(`\\b${cpuMatch[1]}\\b`, 'i');
      return regex.test(czUpper);
    }

    case '쿨러': {
      const ipcWater = ipcUpper.match(/\b(240|280|360|420)\b/);
      const czWater = czUpper.match(/\b(240|280|360|420)\b/);
      if (ipcWater) {
        return czWater?.[1] === ipcWater[1];
      }
      // 공냉: 수냉 표시가 없는 것끼리 매칭
      return !czWater;
    }

    case '메인보드': {
      // 칩셋 추출: H610, B860, Z890E, B650M 등
      const ipcChip = ipcUpper.match(/\b([HBZAX]\d{3}[A-Z]{0,2})\b/);
      if (!ipcChip) return false;
      const czChip = czUpper.match(/\b([HBZAX]\d{3}[A-Z]{0,2})\b/);
      return czChip?.[1] === ipcChip[1];
    }

    case '메모리': {
      // DDR 세대 비교
      const ipcDdr = ipcUpper.match(/DDR(\d)/);
      const czDdr = czUpper.match(/DDR(\d)/);
      if (ipcDdr && czDdr && ipcDdr[1] !== czDdr[1]) return false;

      // 용량 비교
      const ipcGb = ipcUpper.match(/(\d+)\s*GB/);
      const czGb = czUpper.match(/(\d+)\s*GB/);
      if (ipcGb && czGb && ipcGb[1] !== czGb[1]) return false;

      // 클럭 비교 (coreOnly가 아닌 경우에만 - 핵심 매칭에서는 클럭 무시)
      if (!coreOnly) {
        const ipcClk = ipcUpper.match(/PC\d-(\d{4,5})/);
        const czClk = czUpper.match(/PC\d-(\d{4,5})/);
        if (ipcClk && czClk && ipcClk[1] !== czClk[1]) return false;
      }

      return true;
    }

    case '그래픽카드': {
      const ipcGpu = extractGpuInfo(ipcName);
      const czGpu = extractGpuInfo(czName);
      if (!ipcGpu || !czGpu) return false;
      if (ipcGpu.series !== czGpu.series) return false;
      if (ipcGpu.model !== czGpu.model) return false;
      if (ipcGpu.suffix !== czGpu.suffix) return false;
      if (ipcGpu.vram && czGpu.vram && ipcGpu.vram !== czGpu.vram) return false;
      return true;
    }

    case 'SSD': {
      // 저장 방식 비교
      const ipcSata = ipcUpper.includes('SATA');
      const czSata = czUpper.includes('SATA');
      const ipcM2 = /M\.?2|NVME/i.test(ipcUpper);
      const czM2 = /M\.?2|NVME/i.test(czUpper);
      if (ipcSata && !czSata) return false;
      if (ipcM2 && !czM2) return false;

      // 용량 비교
      const ipcCap = ipcUpper.match(/(\d+)\s*(TB|GB)/);
      const czCap = czUpper.match(/(\d+)\s*(TB|GB)/);
      if (ipcCap && czCap) {
        const ipcSize = Number(ipcCap[1]) * (ipcCap[2] === 'TB' ? 1000 : 1);
        const czSize = Number(czCap[1]) * (czCap[2] === 'TB' ? 1000 : 1);
        if (ipcSize !== czSize) return false;
      }
      return true;
    }

    case '케이스':
      return true; // 케이스는 모든 케이스와 비교

    case '파워': {
      // 용량(W) 비교
      const ipcW = ipcUpper.match(/(\d{3,4})\s*W/);
      const czW = czUpper.match(/(\d{3,4})\s*W/);
      if (ipcW && czW && ipcW[1] !== czW[1]) return false;

      // 효율 등급 비교
      const tierMap: [string, string][] = [
        ['PLATINUM', 'PLATINUM'], ['플래티넘', 'PLATINUM'],
        ['GOLD', 'GOLD'], ['골드', 'GOLD'],
        ['SILVER', 'SILVER'], ['실버', 'SILVER'],
        ['BRONZE', 'BRONZE'], ['브론즈', 'BRONZE'],
      ];
      const findTier = (name: string, upper: string) => {
        for (const [key, val] of tierMap) {
          if (upper.includes(key.toUpperCase()) || name.includes(key)) return val;
        }
        return '';
      };
      const ipcTier = findTier(ipcName, ipcUpper);
      const czTier = findTier(czName, czUpper);
      if (ipcTier && czTier && ipcTier !== czTier) return false;

      return true;
    }

    default:
      return false;
  }
}

/**
 * iPC 입력 목록과 컴퓨존 PC 부품 목록을 비교해 매칭 점수 반환
 * score: 매칭된 부품 수, maxScore: 입력된(비어있지 않은) 부품 수
 */
export function scoreComponents(
  inputs: { type: string; name: string }[],
  components: { type: string; partName: string }[]
): { score: number; maxScore: number } {
  const filled = inputs.filter((i) => i.name.trim());
  if (filled.length === 0) return { score: 0, maxScore: 0 };

  let score = 0;
  for (const inp of filled) {
    const comp = components.find((c) => c.type === inp.type);
    if (comp && isSpecMatch(inp.type, inp.name, comp.partName)) score++;
  }
  return { score, maxScore: filled.length };
}
