<?php
/**
 * Plugin Name: ベイろぐ シミュレーター 対戦データ
 * Description: ベイブレードX シミュレーター（非公式）の対戦結果を1ラウンドずつ貯めて、画像あり版の「対戦分析」に返します。
 * Version: 2.0.0
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) exit;

// 分析用にデータを読み出すときのパスワード（画像あり版にだけ入っている）。空のままだと、だれも読み出せない
define('BEYSIM_READ_KEY', '');

function beysim_table() { global $wpdb; return $wpdb->prefix . 'beysim_log'; }

// 表を作る（1ラウンド1行。中身はJSONでそのまま入れる）
register_activation_hook(__FILE__, function () {
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $t = beysim_table();
    $c = $wpdb->get_charset_collate();
    dbDelta("CREATE TABLE $t (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        at datetime NOT NULL,
        build varchar(12) NOT NULL,
        pid varchar(24) NOT NULL,
        data text NOT NULL,
        PRIMARY KEY  (id),
        KEY at (at)
    ) $c;");
});

add_action('rest_api_init', function () {
    register_rest_route('beylog-sim/v1', '/log', [
        ['methods' => 'POST', 'callback' => 'beysim_post', 'permission_callback' => '__return_true'],
        ['methods' => 'GET', 'callback' => 'beysim_get', 'permission_callback' => '__return_true'],
    ]);
});
// シミュレーターは別の場所（自分のPCのファイルなど）から開くこともあるので、どこからでも呼べるようにする
add_filter('rest_pre_serve_request', function ($served, $result, $request) {
    if (strpos($request->get_route(), '/beylog-sim/v1/') === 0) {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST');
        header('Access-Control-Allow-Headers: Content-Type');
    }
    return $served;
}, 10, 3);

// 受け取る項目（これ以外は捨てる）
function beysim_fields() {
    return [
        'id' => ['sid', 'p1', 'p2'],
        'enum' => ['mode' => ['versus', 'tournament'], 'vs' => ['cpu', '2p', 'online'], 'fmt' => ['1v1', '3v3'], 'diff' => ['', 'easy', 'normal', 'hard'], 'win' => ['p1', 'p2'],
            'finish' => ['spin', 'over', 'burst', 'extreme'], 'p1side' => ['L', 'R'], 'p2side' => ['L', 'R'], 'p1shot' => ['水平', '斜め'], 'p2shot' => ['水平', '斜め'], 'build' => ['personal', 'beylog']],
        'text' => ['p1name', 'p2name'],
        'num' => ['p1x', 'p1y', 'p1aim', 'p1rpm', 'p1dash', 'p2x', 'p2y', 'p2aim', 'p2rpm', 'p2dash', 'hits', 'firstHit', 'sec'],
    ];
}

function beysim_post(WP_REST_Request $req) {
    global $wpdb;
    // いたずらで大量に送られないように：同じ人（IPから作った値。IPそのものは保存しない）は10分に300回まで
    $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
    $k = 'beysim_rl_' . md5($ip . wp_salt());
    $cnt = (int) get_transient($k);
    if ($cnt >= 300) return new WP_REST_Response(['ok' => false], 429);
    set_transient($k, $cnt + 1, 600);

    $d = json_decode($req->get_body(), true);
    if (!is_array($d)) return new WP_REST_Response(['ok' => false], 400);
    $F = beysim_fields();
    $pid = is_string($d['pid'] ?? null) && preg_match('/^[a-z0-9]{4,24}$/', $d['pid']) ? $d['pid'] : null;
    if (!$pid) return new WP_REST_Response(['ok' => false], 400);
    $row = [];
    foreach ($F['id'] as $f) { $v = $d[$f] ?? ''; if (!is_string($v) || !preg_match('/^[A-Za-z0-9_:|+.\-]{1,96}$/', $v)) return new WP_REST_Response(['ok' => false], 400); $row[$f] = $v; }
    foreach ($F['enum'] as $f => $ok) { $v = $d[$f] ?? ''; if (!in_array($v, $ok, true)) return new WP_REST_Response(['ok' => false], 400); $row[$f] = $v; }
    foreach ($F['text'] as $f) { $row[$f] = mb_substr(sanitize_text_field((string) ($d[$f] ?? '')), 0, 80); }
    foreach ($F['num'] as $f) { $v = $d[$f] ?? ''; $row[$f] = is_numeric($v) ? round((float) $v, 1) : ''; }
    $wpdb->insert(beysim_table(), ['at' => current_time('mysql'), 'build' => $row['build'], 'pid' => $pid, 'data' => wp_json_encode($row, JSON_UNESCAPED_UNICODE)]);
    return new WP_REST_Response(['ok' => true], 200);
}

// 分析用：パスワードが合っているときだけ、全部の行を返す（since=最後に受け取ったid で、それより新しい分だけ）
function beysim_get(WP_REST_Request $req) {
    global $wpdb;
    $key = (string) $req->get_param('key');
    if (BEYSIM_READ_KEY === '' || !hash_equals(BEYSIM_READ_KEY, $key)) return new WP_REST_Response(['error' => 'key'], 403);
    $since = max(0, (int) $req->get_param('since'));
    $t = beysim_table();
    $rows = [];
    foreach ($wpdb->get_results($wpdb->prepare("SELECT id, at, pid, data FROM $t WHERE id > %d ORDER BY id LIMIT 50000", $since)) as $r) {
        $o = json_decode($r->data, true);
        if (!is_array($o)) continue;
        $o['id'] = (int) $r->id; $o['pid'] = $r->pid; $o['time'] = mysql2date('c', $r->at);
        $rows[] = $o;
    }
    $res = new WP_REST_Response(['rows' => $rows], 200);
    $res->header('Cache-Control', 'no-store');
    return $res;
}
