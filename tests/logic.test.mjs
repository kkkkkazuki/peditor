/* index.html のロジックを Node 上で動かす回帰テスト。
   依存なし・ブラウザ不要:  node tests/logic.test.mjs
   PDFの描画は検証できない（DOMとpdf.jsはスタブ）。
   検証するのは「状態遷移が壊れていないこと」= PLAN.md §5 の 5・6・B-3 に対応する部分。 */
import vm from "node:vm";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const src = html.split("<script>\n").pop().split("</script>")[0];

// --- 何でも受け止める最小のDOMスタブ ---
const mkEl = () => {
  const el = {
    style:{}, dataset:{}, classList:{add(){},remove(){},toggle(){},contains(){return false}},
    children:[], textContent:"", innerHTML:"", hidden:false, disabled:false, value:"",
    width:0, height:0,
    appendChild(c){ this.children.push(c); }, querySelector(){ return mkEl(); },
    querySelectorAll(){ return []; }, addEventListener(){}, click(){},
    getBoundingClientRect(){ return {width:1200,height:800,left:0,top:0}; },
    getContext(){ return {}; }, toDataURL(){ return "data:,"; },
  };
  return el;
};
const els = new Map();
const byId = id => { if(!els.has(id)) els.set(id, mkEl()); return els.get(id); };

const page = { rotate:0, getViewport:()=>({width:595,height:842}), render:()=>({promise:Promise.resolve(), cancel(){}}) };
const docs = new Map();   // name -> numPages | Error

const ctx = {
  console,
  setTimeout, clearTimeout,
  confirm: () => true,
  Blob: class { constructor(){} }, URL: { createObjectURL:()=>"blob:x", revokeObjectURL(){} },
  pdfjsLib: {
    GlobalWorkerOptions: {},
    getDocument: ({}) => ({ promise: ctx.__next() }),
  },
  PDFLib: { PDFDocument: { create: async()=>({}), load: async()=>({}) } },
  document: {
    getElementById: byId, createElement: mkEl,
    querySelectorAll: () => [], addEventListener(){},
  },
  window: { addEventListener(){}, devicePixelRatio:1, showSaveFilePicker:undefined, open(){} },
};
ctx.window.window = ctx.window;
vm.createContext(ctx);

// getDocument が返す結果をテスト側から差し込む
let queue = [];
ctx.__next = () => queue.shift()();
const okDoc  = n => () => Promise.resolve({ numPages:n, getPage: async()=>page });
const badDoc = name => () => Promise.reject(Object.assign(new Error("pw"), {name}));

vm.runInContext(src, ctx);
const S = vm.runInContext("S", ctx);
const call = (fn, ...a) => vm.runInContext(fn, ctx)(...a);
const file = name => ({ name, type:"application/pdf", arrayBuffer: async()=>new ArrayBuffer(8) });
const stMsg = () => byId("stMsg").textContent;

let fails = 0;
const check = (label, cond, extra="") => {
  console.log((cond ? "  PASS " : "  FAIL ") + label + (extra ? "  → " + extra : ""));
  if(!cond) fails++;
};

console.log("① 開く → 回転 → PDFを追加 → Undo（B-1の回帰テスト）");
queue = [okDoc(3)];
await call("openFiles", [file("a.pdf")]);
check("3ページ読み込めた", S.order.length === 3, "order=" + S.order.length);
check("開いた直後は未編集", S.dirty === false);

call("rotate", 90);
check("回転で dirty が立つ", S.dirty === true);
check("履歴が1つ積まれた", S.undo.length === 1);

queue = [okDoc(2)];
await call("addFiles", [file("b.pdf")]);
check("追加後は5ページ", S.order.length === 5, "order=" + S.order.length);
check("履歴は2つ", S.undo.length === 2, "undo=" + S.undo.length);
check("履歴に穴が無い", S.undo.every(h => Array.isArray(h)), JSON.stringify(S.undo.map(h=>h&&h.length)));

try{
  call("undo");
  check("追加のUndoが例外にならない", true);
  check("3ページに戻る", S.order.length === 3, "order=" + S.order.length);
  check("回転は残っている", S.order[0].r === 90, "r=" + S.order[0].r);
  call("undo");
  check("さらにUndoで回転も戻る", S.order[0].r === 0, "r=" + S.order[0].r);
  call("redo");
  check("Redoで回転が戻る", S.order[0].r === 90, "r=" + S.order[0].r);
}catch(err){
  check("追加のUndoが例外にならない", false, err.constructor.name + ": " + err.message);
}

console.log("② 壊れた/暗号化PDFの扱い（B-2）");
queue = [badDoc("PasswordException")];
await call("openFiles", [file("locked.pdf")]);
check("固まらずメッセージが出る", /パスワード付き/.test(stMsg()), JSON.stringify(stMsg()));
check("ページは増えていない", S.order.length === 0);

queue = [okDoc(2), badDoc("InvalidPDFException")];
await call("openFiles", [file("ok.pdf"), file("broken.pdf")]);
check("失敗を混ぜても成功分は開く", S.order.length === 2, "order=" + S.order.length);
check("一部失敗と報告される", /一部読み込めませんでした/.test(stMsg()), JSON.stringify(stMsg()));

console.log("③ PDF以外のファイル");
await call("openFiles", [{ name:"memo.txt", type:"text/plain", arrayBuffer:async()=>new ArrayBuffer(1) }]);
check("既存ページを壊さない", S.order.length === 2);
check("メッセージが出る", /PDFファイルがありません/.test(stMsg()), JSON.stringify(stMsg()));

console.log("④ 未保存ガード（B-3）");
call("rotate", 90);
check("編集で dirty", S.dirty === true);
let asked = 0;
ctx.confirm = () => { asked++; return false; };
queue = [okDoc(1)];
await call("openFiles", [file("c.pdf")]);
check("dirty なら確認する", asked === 1);
check("キャンセルすれば破棄されない", S.order.length === 2, "order=" + S.order.length);
ctx.confirm = () => true;
queue = [okDoc(1)];
await call("openFiles", [file("c.pdf")]);
check("OKなら開き直す", S.order.length === 1 && S.dirty === false);

console.log(fails ? `\n${fails} 件 FAIL` : "\nすべてPASS");
process.exit(fails ? 1 : 0);
