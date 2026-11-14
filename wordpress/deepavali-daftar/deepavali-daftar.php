<?php
/**
 * Plugin Name: Deepavali Daftar Orang Ramai
 * Description: Public registration form for the crowd at Grand Deepavali Parlimen Ampang (Nama, No KP, No telefon, Bantuan yang diharapkan) at /daftar/, and an admin-only list with Excel download and QR poster at /daftar/senarai/. Admins = WordPress admins or Bantuan station admin codes.
 * Version: 1.0.0
 * Author: Carama Technologies Solution
 * Requires PHP: 8.0
 * License: Proprietary
 */

defined( 'ABSPATH' ) || exit;

const DVD_VERSION = '1.0.0';
const DVD_DB      = 1;
const DVD_SLUG    = 'daftar';
const DVD_NS      = 'dvd/v1';
const DVD_TZ      = 'Asia/Kuala_Lumpur';

function dvd_table() {
	global $wpdb;
	return $wpdb->prefix . 'dvd_regs';
}
function dvd_install() {
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	$c = $wpdb->get_charset_collate();
	dbDelta( 'CREATE TABLE ' . dvd_table() . " (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		name varchar(160) NOT NULL DEFAULT '',
		ic varchar(24) NOT NULL DEFAULT '',
		phone varchar(40) NOT NULL DEFAULT '',
		bantuan text NULL,
		consent tinyint(1) NOT NULL DEFAULT 0,
		ip_hash char(32) NOT NULL DEFAULT '',
		created_at datetime NOT NULL,
		PRIMARY KEY  (id),
		KEY ic (ic)
	) $c;" );
	update_option( 'dvd_db', DVD_DB, false );
}
register_activation_hook( __FILE__, function () {
	dvd_install();
	dvd_rules();
	flush_rewrite_rules();
} );
add_action( 'plugins_loaded', function () {
	if ( (int) get_option( 'dvd_db', 0 ) < DVD_DB ) {
		dvd_install();
	}
} );

function dvd_open() {
	return (bool) get_option( 'dvd_open', true );
}
function dvd_ip() {
	return preg_replace( '/[^0-9a-fA-F:.]/', '', (string) ( $_SERVER['REMOTE_ADDR'] ?? '' ) );
}
/** Admin = WordPress admin, or a Bantuan station admin code (same cookie as /bantuan/). */
function dvd_is_admin() {
	if ( current_user_can( 'manage_options' ) ) {
		return true;
	}
	return function_exists( 'dvb_is_admin' ) && dvb_is_admin();
}
function dvd_who() {
	if ( function_exists( 'dvb_me' ) ) {
		return dvb_me();
	}
	return is_user_logged_in() ? wp_get_current_user()->display_name : '';
}
function dvd_ic( $v ) {
	$v = strtoupper( preg_replace( '/[^0-9A-Za-z]/', '', (string) $v ) );
	return mb_substr( $v, 0, 24 );
}
function dvd_phone( $v ) {
	$v    = trim( (string) $v );
	$plus = str_starts_with( $v, '+' );
	$d    = preg_replace( '/\D/', '', $v );
	if ( ! $plus && preg_match( '/^1\d{8,9}$/', $d ) ) {
		$d = '0' . $d;
	}
	return mb_substr( ( $plus ? '+' : '' ) . $d, 0, 40 );
}
function dvd_err( $code, $msg, $status = 400 ) {
	return new WP_Error( $code, $msg, array( 'status' => $status ) );
}

function dvd_submit( WP_REST_Request $r ) {
	global $wpdb;
	if ( ! dvd_open() ) {
		return dvd_err( 'dvd_closed', 'Pendaftaran sudah ditutup. Terima kasih.', 403 );
	}
	if ( '' !== trim( (string) $r->get_param( 'website' ) ) ) { // honeypot
		return rest_ensure_response( array( 'ok' => true ) );
	}
	$key   = 'dvd_tries_' . md5( dvd_ip() );
	$tries = (int) get_transient( $key );
	if ( $tries >= 120 ) {
		return dvd_err( 'dvd_slow', 'Terlalu banyak pendaftaran dari peranti ini. Cuba lagi selepas 10 minit.', 429 );
	}
	$name    = mb_substr( sanitize_text_field( (string) $r->get_param( 'name' ) ), 0, 160 );
	$ic      = dvd_ic( $r->get_param( 'ic' ) );
	$phone   = dvd_phone( $r->get_param( 'phone' ) );
	$bantuan = mb_substr( sanitize_textarea_field( (string) $r->get_param( 'bantuan' ) ), 0, 1000 );
	$consent = (bool) $r->get_param( 'consent' );
	if ( mb_strlen( $name ) < 2 ) {
		return dvd_err( 'dvd_name', 'Sila isi nama penuh.' );
	}
	if ( ! preg_match( '/^\d{12}$/', $ic ) && ! preg_match( '/^[A-Z0-9]{6,20}$/', $ic ) ) {
		return dvd_err( 'dvd_ic', 'No Kad Pengenalan tidak sah. Contoh: 800101-14-5678.' );
	}
	$pd = ltrim( $phone, '+' );
	if ( strlen( $pd ) < 9 || strlen( $pd ) > 15 ) {
		return dvd_err( 'dvd_phone', 'No telefon bimbit tidak sah. Contoh: 012-345 6789.' );
	}
	if ( ! $consent ) {
		return dvd_err( 'dvd_consent', 'Sila tandakan persetujuan PDPA untuk meneruskan.' );
	}
	set_transient( $key, $tries + 1, 10 * MINUTE_IN_SECONDS );
	$dup = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT id FROM ' . dvd_table() . ' WHERE ic = %s LIMIT 1', $ic ) );
	if ( $dup ) {
		return rest_ensure_response( array( 'ok' => true, 'dup' => true ) );
	}
	$ok = $wpdb->insert( dvd_table(), array(
		'name'       => $name,
		'ic'         => $ic,
		'phone'      => $phone,
		'bantuan'    => $bantuan,
		'consent'    => 1,
		'ip_hash'    => md5( dvd_ip() . wp_salt( 'nonce' ) ),
		'created_at' => current_time( 'mysql', true ),
	) );
	if ( ! $ok ) {
		return dvd_err( 'dvd_db', 'Maaf, ralat sistem. Sila cuba sekali lagi.', 500 );
	}
	return rest_ensure_response( array( 'ok' => true, 'no' => (int) $wpdb->insert_id ) );
}

function dvd_list() {
	global $wpdb;
	$rows = $wpdb->get_results( 'SELECT id, name, ic, phone, bantuan, created_at FROM ' . dvd_table() . ' ORDER BY id DESC', ARRAY_A );
	foreach ( $rows as &$x ) {
		$x['id']         = (int) $x['id'];
		$x['created_at'] = gmdate( 'c', strtotime( $x['created_at'] . ' UTC' ) );
	}
	return array( 'rows' => $rows, 'open' => dvd_open(), 'who' => dvd_who() );
}

add_action( 'rest_api_init', function () {
	$hdr   = fn( WP_REST_Request $r ) => '1' === $r->get_header( 'x_dvd' );
	$admin = function ( WP_REST_Request $r ) use ( $hdr ) {
		if ( ! $hdr( $r ) ) {
			return dvd_err( 'dvd_forbidden', 'Missing app header.', 403 );
		}
		return dvd_is_admin() ? true : dvd_err( 'dvd_admin', 'Admin sahaja.', 401 );
	};
	register_rest_route( DVD_NS, '/daftar', array(
		'methods'             => 'POST',
		'permission_callback' => fn( $r ) => $hdr( $r ) ? true : dvd_err( 'dvd_forbidden', 'Missing app header.', 403 ),
		'callback'            => 'dvd_submit',
	) );
	register_rest_route( DVD_NS, '/senarai', array(
		'methods' => 'GET', 'permission_callback' => $admin, 'callback' => fn() => rest_ensure_response( dvd_list() ),
	) );
	register_rest_route( DVD_NS, '/padam', array(
		'methods' => 'POST', 'permission_callback' => $admin,
		'callback' => function ( WP_REST_Request $r ) {
			global $wpdb;
			$id = (int) $r->get_param( 'id' );
			$wpdb->delete( dvd_table(), array( 'id' => $id ) );
			return rest_ensure_response( dvd_list() );
		},
	) );
	register_rest_route( DVD_NS, '/tetapan', array(
		'methods' => 'POST', 'permission_callback' => $admin,
		'callback' => function ( WP_REST_Request $r ) {
			update_option( 'dvd_open', (bool) $r->get_param( 'open' ), false );
			return rest_ensure_response( dvd_list() );
		},
	) );
} );
add_filter( 'rest_post_dispatch', function ( $res, $server, $req ) {
	if ( $res instanceof WP_REST_Response && $req instanceof WP_REST_Request && 0 === strpos( ltrim( $req->get_route(), '/' ), DVD_NS ) ) {
		$res->header( 'Cache-Control', 'no-store, private, max-age=0' );
		$res->header( 'X-LiteSpeed-Cache-Control', 'no-cache' );
		$res->header( 'X-Robots-Tag', 'noindex, nofollow' );
	}
	return $res;
}, 99, 3 );

function dvd_rules() {
	add_rewrite_rule( '^' . DVD_SLUG . '/?$', 'index.php?dvd_app=form', 'top' );
	add_rewrite_rule( '^' . DVD_SLUG . '/senarai/?$', 'index.php?dvd_app=admin', 'top' );
}
add_action( 'init', 'dvd_rules' );
add_filter( 'query_vars', function ( $v ) {
	$v[] = 'dvd_app';
	return $v;
} );

add_action( 'template_redirect', function () {
	$app = get_query_var( 'dvd_app' );
	if ( ! in_array( $app, array( 'form', 'admin' ), true ) ) {
		return;
	}
	nocache_headers();
	header( 'X-Robots-Tag: noindex, nofollow', true );
	header( 'X-LiteSpeed-Cache-Control: no-cache', true );
	$fonts  = plugins_url( 'deepavali-floor/assets/fonts/' );
	$base   = plugin_dir_url( __FILE__ ) . 'assets/';
	$config = array(
		'rest'     => esc_url_raw( rest_url( DVD_NS . '/' ) ),
		'dvbRest'  => esc_url_raw( rest_url( 'dvb/v1/' ) ),
		'nonce'    => is_user_logged_in() ? wp_create_nonce( 'wp_rest' ) : '',
		'formUrl'  => home_url( '/' . DVD_SLUG . '/' ),
		'open'     => dvd_open(),
		'admin'    => 'admin' === $app ? dvd_is_admin() : false,
		'tz'       => DVD_TZ,
		'mode'     => $app,
	);
	$title = 'admin' === $app ? 'Senarai pendaftaran · Grand Deepavali Ampang' : 'Daftar · Grand Deepavali Parlimen Ampang';
	?><!doctype html>
<html lang="ms">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#8B1E2D">
<meta name="color-scheme" content="light">
<title><?php echo esc_html( $title ); ?></title>
<link rel="icon" type="image/svg+xml" href="<?php echo esc_url( plugins_url( 'deepavali-floor/assets/icons/diya.svg' ) ); ?>">
<style>
@font-face { font-family: "Inter"; src: url("<?php echo esc_url( $fonts . 'inter-latin-wght.woff2' ); ?>") format("woff2"); font-weight: 100 900; font-display: swap; }
@font-face { font-family: "Rajdhani"; src: url("<?php echo esc_url( $fonts . 'rajdhani-latin-700.woff2' ); ?>") format("woff2"); font-weight: 700; font-display: swap; }
</style>
<link rel="stylesheet" href="<?php echo esc_url( $base . 'daftar.css?v=' . DVD_VERSION ); ?>">
</head>
<body class="dd-<?php echo esc_attr( $app ); ?>">
<div id="dd-app"></div>
<script>window.DVD = <?php echo wp_json_encode( $config ); ?>;</script>
<?php if ( 'admin' === $app ) : ?>
<script src="<?php echo esc_url( plugins_url( 'deepavali-floor/assets/xlsx.min.js' ) . '?v=0.18.5' ); ?>" defer></script>
<script src="<?php echo esc_url( plugins_url( 'deepavali-bantuan/assets/qrcode.js' ) . '?v=2.0.4' ); ?>" defer></script>
<?php endif; ?>
<script src="<?php echo esc_url( $base . 'daftar.js?v=' . DVD_VERSION ); ?>" defer></script>
</body>
</html>
	<?php
	exit;
} );
