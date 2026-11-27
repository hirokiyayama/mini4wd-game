// 対戦分析の画面（個人用の版だけ）：トップの「対戦分析」で開く
// 読み出しのパスワード（ベイろぐのプラグインの BEYSIM_READ_KEY と同じ）は、ビルドするときに VITE_BEY_AN_KEY で入れる（リポジトリには書かない）
import analysisHtml from '../../tools/bey-analysis/analysis.html?raw';
const w = window as unknown as { __BEY_ANALYSIS?: string; __BEY_AN_KEY?: string };
w.__BEY_ANALYSIS = analysisHtml;
w.__BEY_AN_KEY = (import.meta.env.VITE_BEY_AN_KEY as string | undefined) ?? '';
