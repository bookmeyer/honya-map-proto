// 窓口をアプリの中で開く（v0.37.0）：設定の「書店・図書館の方へ」「お問い合わせ・ご要望」と、店のページの「この店の方へ」から
import { APP_VER } from './config.js?v=0.37.9';
import { $ } from './util.js?v=0.37.9';
import { openModal, closeModal, toast } from './ui.js?v=0.37.9';
import { apiBase, deviceId } from './events.js?v=0.37.9';
import { search } from './data.js?v=0.37.9';
import { mountInbox } from './inbox.js?v=0.37.9';

const find = async (w) => search(w, 12).filter((s) => !s.demo && !s.custom).map((s) => ({ i: s.i, n: s.n, a: s.a || (s.aa ? s.aa + ' 付近' : '') }));

/** mode：'join'（参加の申し込み）か 'contact'（お問い合わせ・ご要望）。o.store：{ i, n, lib }、o.kind：問い合わせの種類を先に選んでおく */
export function openInbox(mode, o = {}) {
  openModal(`<h2>${mode === 'join' ? (o.store && o.store.lib ? '図書館の方へ：本めぐりに参加する' : 'お店の方へ：本めぐりに参加する') : 'お問い合わせ・ご要望'}</h2><div id="ib-root"></div><div class="actions"><button class="btn" id="ib-close">閉じる</button></div>`);
  $('#ib-close').onclick = closeModal;
  mountInbox($('#ib-root'), mode, Object.assign({ api: apiBase(), ver: APP_VER, search: find, device: deviceId(), cancel: false, onDone: (k) => toast(k === 'idea' ? 'ありがとうございます。届きました' : '受け付けました', 'ok') }, o));
}
