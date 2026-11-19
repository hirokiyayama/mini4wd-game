<?php
/**
 * Plugin Name: ベイろぐ シミュレーター 対戦データ
 * Description: ベイブレードX シミュレーター（非公式）の対戦結果を貯めて、勝率・よく使われる組み合わせのランキングを返します。
 * Version: 1.0.0
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) exit;

// シミュレーターから届く1ラウンドの結果を貯める表
function beysim_table() { global $wpdb; return $wpdb->prefix . 'beysim_rounds'; }

register_activation_hook(__FILE__, function () {
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $t = beysim_table();
    $c = $wpdb->get_charset_collate();
    dbDelta("CREATE TABLE $t (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        at datetime NOT NULL,
        gm char(1) NOT NULL,
        f tinyint(1) NOT NULL,
        fin varchar(12) NOT NULL,
        w tinyint(1) NOT NULL,
        b0 varchar(24) NOT NULL, r0 varchar(24) NOT NULL, t0 varchar(8) NOT NULL, h0 tinyint(1) NOT NULL,
        b1 varchar(24) NOT NULL, r1 varchar(24) NOT NULL, t1 varchar(8) NOT NULL, h1 tinyint(1) NOT NULL,
        PRIMARY KEY  (id),
        KEY at (at)
    ) $c;");
});

// どのサイトから開いたシミュレーターでも使えるように（データはだれでも見られるランキングだけ）
add_action('rest_api_init', function () {
    register_rest_route('beylog-sim/v1', '/rounds', [
        ['methods' => 'POST', 'callback' => 'beysim_post', 'permission_callback' => '__return_true'],
        ['methods' => 'GET', 'callback' => 'beysim_get', 'permission_callback' => '__return_true'],
    ]);
});
add_filter('rest_pre_serve_request', function ($served, $result, $request) {
    if (strpos($request->get_route(), '/beylog-sim/v1/') === 0) {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST');
    }
    return $served;
}, 10, 3);

// パーツのid（英数字と _ と : だけ）
function beysim_id($v, $max = 24) {
    $v = is_string($v) ? $v : '';
    return preg_match('/^[A-Za-z0-9_:]{0,' . $max . '}$/', $v) ? $v : null;
}

function beysim_post(WP_REST_Request $req) {
    global $wpdb;
    // いたずらで大量に送られないように：同じ人（IPから作った値）は10分に200回まで
    $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
    $k = 'beysim_rl_' . md5($ip . wp_salt());
    $cnt = (int) get_transient($k);
    if ($cnt >= 200) return new WP_REST_Response(['ok' => false], 429);
    set_transient($k, $cnt + 1, 600);

    $d = json_decode($req->get_body(), true);
    if (!is_array($d) || !isset($d['s']) || !is_array($d['s']) || count($d['s']) !== 2) return new WP_REST_Response(['ok' => false], 400);
    $gm = in_array($d['gm'] ?? '', ['v', 't', 'o'], true) ? $d['gm'] : null;
    $fin = in_array($d['fin'] ?? '', ['spin', 'over', 'burst', 'extreme'], true) ? $d['fin'] : null;
    $f = (int) ($d['f'] ?? 1) === 3 ? 3 : 1;
    $w = (int) ($d['w'] ?? 0) === 1 ? 1 : 0;
    if (!$gm || !$fin) return new WP_REST_Response(['ok' => false], 400);
    $row = ['at' => current_time('mysql'), 'gm' => $gm, 'f' => $f, 'fin' => $fin, 'w' => $w];
    foreach ([0, 1] as $i) {
        $s = $d['s'][$i];
        if (!is_array($s)) return new WP_REST_Response(['ok' => false], 400);
        $b = beysim_id($s['b'] ?? ''); $r = beysim_id($s['r'] ?? ''); $t = beysim_id($s['t'] ?? '', 8);
        if ($b === null || $b === '' || $r === null || $t === null || $t === '') return new WP_REST_Response(['ok' => false], 400);
        $row["b$i"] = $b . (!empty($s['low']) ? ':low' : ''); // ヘルズネザーのローモードは「:low」をつけて別に数える
        $row["r$i"] = $r; $row["t$i"] = $t; $row["h$i"] = !empty($s['h']) ? 1 : 0;
    }
    if (!$row['h0'] && !$row['h1']) return new WP_REST_Response(['ok' => true], 200); // CPU同士は数えない
    $wpdb->insert(beysim_table(), $row);
    return new WP_REST_Response(['ok' => true], 200);
}

// 集計：期間（今日・7日間・30日間・全期間）ごとに、人が選んだベイだけを数える。5分ごとに作り直す
function beysim_get(WP_REST_Request $req) {
    global $wpdb;
    $p = $req->get_param('period');
    $p = in_array($p, ['day', 'week', 'month', 'all'], true) ? $p : 'all';
    $ck = 'beysim_agg_' . $p;
    $cached = get_transient($ck);
    if ($cached !== false) return new WP_REST_Response($cached, 200);

    $t = beysim_table();
    $now = current_time('timestamp');
    $from = $p === 'all' ? '1970-01-01 00:00:00' : ($p === 'day' ? date('Y-m-d 00:00:00', $now) : date('Y-m-d H:i:s', $now - ($p === 'week' ? 7 : 30) * 86400));

    $rounds = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM $t WHERE at >= %s", $from));
    $finish = [];
    foreach ($wpdb->get_results($wpdb->prepare("SELECT fin, COUNT(*) n FROM $t WHERE at >= %s GROUP BY fin", $from)) as $r) $finish[$r->fin] = (int) $r->n;

    $merge = function ($sqlFor) use ($wpdb, $from) {
        $m = [];
        foreach ([0, 1] as $i) {
            foreach ($wpdb->get_results($wpdb->prepare($sqlFor($i), $i, $from)) as $r) {
                if ($r->k === '' || $r->k === null) continue;
                if (!isset($m[$r->k])) $m[$r->k] = ['key' => $r->k, 'n' => 0, 'win' => 0];
                $m[$r->k]['n'] += (int) $r->n; $m[$r->k]['win'] += (int) $r->win;
            }
        }
        return array_values($m);
    };
    $col = function ($c) use ($t) { return function ($i) use ($c, $t) { return "SELECT {$c}{$i} k, COUNT(*) n, SUM(w = %d) win FROM $t WHERE at >= %s AND h{$i} = 1 GROUP BY {$c}{$i}"; }; };
    $combo = function ($i) use ($t) { return "SELECT CONCAT(b{$i}, '|', r{$i}, '|', t{$i}) k, COUNT(*) n, SUM(w = %d) win FROM $t WHERE at >= %s AND h{$i} = 1 GROUP BY b{$i}, r{$i}, t{$i}"; };

    $combos = $merge($combo);
    usort($combos, function ($a, $b) { return $b['n'] - $a['n']; });
    $out = [
        'rounds' => $rounds,
        'blade' => $merge($col('b')),
        'ratchet' => $merge($col('r')),
        'bit' => $merge($col('t')),
        'combo' => array_slice($combos, 0, 100),
        'finish' => (object) $finish,
    ];
    set_transient($ck, $out, 300);
    return new WP_REST_Response($out, 200);
}
