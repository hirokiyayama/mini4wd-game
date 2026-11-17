// 個人用の画像つき版だけで読み込む：ブレード（ブレードのidと同じ名前）とランチャーの画像
import meteor from './beys/meteor.png';
import cobalt from './beys/cobalt.png';
import wizard from './beys/wizard.png';
import aero from './beys/aero.png';
import shark from './beys/shark.png';
import glory from './beys/glory.png';
import knight2 from './beys/knight2.png';
import phoenix from './beys/phoenix.png';
import hells from './beys/hells.png';
import wyvern from './beys/wyvern.png';
import clock from './beys/clock.png';
import golem from './beys/golem.png';
import launcher_red from './launcher_red.png';
import launcher_black from './launcher_black.png';

(window as unknown as { __BEY_IMGS?: Record<string, string> }).__BEY_IMGS = { meteor, cobalt, wizard, aero, shark, glory, knight2, phoenix, hells, wyvern, clock, golem, launcher_red, launcher_black };
