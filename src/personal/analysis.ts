// 対戦分析の画面（個人用の版だけ）：トップの「対戦分析」で開く
import analysisHtml from '../../tools/bey-analysis/analysis.html?raw';
(window as unknown as { __BEY_ANALYSIS?: string }).__BEY_ANALYSIS = analysisHtml;
