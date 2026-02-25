/**
 * 부품 type 문자열을 표준 카테고리로 매핑하고, 브랜드명을 대괄호에서 추출하는 유틸리티.
 */

// 크롤러가 수집하는 type 문자열 → 표준 카테고리 매핑
const TYPE_MAP: Record<string, string> = {
    CPU: 'cpu',
    'CPU쿨러': 'cooler',
    쿨러: 'cooler',
    메인보드: 'mainboard',
    '주기판': 'mainboard',
    메모리: 'memory',
    RAM: 'memory',
    그래픽카드: 'gpu',
    VGA: 'gpu',
    SSD: 'ssd',
    저장장치: 'ssd',
    HDD: 'ssd',
    케이스: 'case',
    파워: 'power',
    '파워서플라이': 'power',
};

export type ComponentCategory = 'cpu' | 'cooler' | 'mainboard' | 'memory' | 'gpu' | 'ssd' | 'case' | 'power' | 'etc';

export interface ComponentInfo {
    type: string;
    partName: string;
    partPrice: number;
    quantity: number;
}

export interface ParsedProduct {
    productNo: string;
    name: string;
    originalPrice: number;
    discountPrice: number;
    detailUrl: string;
    brand: string;
    // 카테고리별 부품명
    cpu: string;
    cooler: string;
    mainboard: string;
    memory: string;
    gpu: string;
    ssd: string;
    case_: string;  // 'case'는 JS 예약어
    power: string;
    etc: string;
    components: ComponentInfo[];
}

/**
 * type 문자열을 표준 카테고리로 변환
 */
export function mapTypeToCategory(type: string): ComponentCategory {
    // 정확한 매칭 우선
    if (TYPE_MAP[type]) return TYPE_MAP[type] as ComponentCategory;

    // 부분 매칭
    const lower = type.toLowerCase();
    if (lower.includes('cpu') && !lower.includes('쿨러') && !lower.includes('cooler')) return 'cpu';
    if (lower.includes('쿨러') || lower.includes('cooler')) return 'cooler';
    if (lower.includes('메인보드') || lower.includes('주기판')) return 'mainboard';
    if (lower.includes('메모리') || lower.includes('ram')) return 'memory';
    if (lower.includes('그래픽') || lower.includes('vga')) return 'gpu';
    if (lower.includes('ssd') || lower.includes('저장') || lower.includes('hdd')) return 'ssd';
    if (lower.includes('케이스')) return 'case';
    if (lower.includes('파워') || lower.includes('power')) return 'power';

    return 'etc';
}

/**
 * 부품명에서 대괄호 안의 브랜드명 추출
 * 예: "[INTEL] Core i7-13700K" → "INTEL"
 */
export function extractBrand(partName: string): string {
    const match = partName.match(/\[([^\]]+)\]/);
    return match ? match[1].trim() : '기타';
}

/**
 * Firestore에서 가져온 Product 데이터를 ParsedProduct로 변환
 */
export function parseProduct(raw: any): ParsedProduct {
    const components: ComponentInfo[] = raw.components || [];

    const parsed: ParsedProduct = {
        productNo: raw.productNo || '',
        name: raw.name || '',
        originalPrice: Number(raw.originalPrice) || 0,
        discountPrice: Number(raw.discountPrice) || 0,
        detailUrl: raw.detailUrl || '',
        brand: raw.brand || '',
        cpu: '',
        cooler: '',
        mainboard: '',
        memory: '',
        gpu: '',
        ssd: '',
        case_: '',
        power: '',
        etc: '',
        components,
    };

    const etcParts: string[] = [];

    components.forEach((comp) => {
        const category = mapTypeToCategory(comp.type);
        const name = comp.partName || '';

        switch (category) {
            case 'cpu':
                parsed.cpu = parsed.cpu ? `${parsed.cpu} / ${name}` : name;
                break;
            case 'cooler':
                parsed.cooler = parsed.cooler ? `${parsed.cooler} / ${name}` : name;
                break;
            case 'mainboard':
                parsed.mainboard = parsed.mainboard ? `${parsed.mainboard} / ${name}` : name;
                break;
            case 'memory':
                parsed.memory = parsed.memory ? `${parsed.memory} / ${name}` : name;
                break;
            case 'gpu':
                parsed.gpu = parsed.gpu ? `${parsed.gpu} / ${name}` : name;
                break;
            case 'ssd':
                parsed.ssd = parsed.ssd ? `${parsed.ssd} / ${name}` : name;
                break;
            case 'case':
                parsed.case_ = parsed.case_ ? `${parsed.case_} / ${name}` : name;
                break;
            case 'power':
                parsed.power = parsed.power ? `${parsed.power} / ${name}` : name;
                break;
            default:
                etcParts.push(`[${comp.type}] ${name}`);
        }
    });

    parsed.etc = etcParts.join(' / ');

    return parsed;
}
