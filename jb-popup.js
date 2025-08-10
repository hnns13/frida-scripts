// step4_block_exit.js — Exit-Button im Jailbreak-Popup neutralisieren
'use strict';

function str(o){ try { return o ? o.toString() : ""; } catch(_) { return ""; } }
function low(s){ return (s||"").toLowerCase(); }
function isExitTitle(t){
  const L = low(t);
  return (
    L.includes("exit") || L.includes("quit") || L.includes("close") || L.includes("schließ") ||
    L.includes("schlies") || L.includes("beenden") || L.includes("app schließen") || L.includes("app schliessen")
  );
}

if (ObjC.available) {
  // 1) UIAlertAction factory: "Exit/Schließen" -> Handler auf null setzen (no-op)
  try {
    const UIAlertAction = ObjC.classes.UIAlertAction;
    if (UIAlertAction && UIAlertAction["+ actionWithTitle:style:handler:"]) {
      Interceptor.attach(UIAlertAction["+ actionWithTitle:style:handler:"].implementation, {
        onEnter(args){
          // args[2]=title, args[3]=style, args[4]=block
          const title = args[2].isNull() ? "" : new ObjC.Object(args[2]).toString();
          this.makeNoop = isExitTitle(title);
          this.title = title;
          if (this.makeNoop) {
            // Handler auf NULL setzen
            args[4] = ptr(0);
            // Optional: Style von "destructive" auf "cancel" ändern (0=Default, 1=Cancel, 2=Destructive)
            try { args[3] = ptr(1); } catch(_) {}
            console.log("[ExitBypass] UIAlertAction factory neutralisiert:", title);
          }
        }
      });
    }
  } catch(e){ console.log("[ExitBypass] actionWithTitle hook error:", e); }

  // 2) Fallback: privates -[_invokeHandler] unterbinden (falls Handler schon gesetzt wurde)
  try {
    const C = ObjC.classes.UIAlertAction;
    if (C && C["- _invokeHandler"]) {
      Interceptor.attach(C["- _invokeHandler"].implementation, {
        onEnter(){
          // Wir können hier zusätzlich prüfen, ob der Titel nach Exit klingt:
          try {
            const self = this.context ? this.context : null;
          } catch(_) {}
        },
        onLeave(ret){
          // Immer no-op: verhindert Ausführung des hinterlegten Blocks
          ret.replace(ptr(0));
          console.log("[ExitBypass] UIAlertAction _invokeHandler abgefangen (no-op)");
        }
      });
    }
  } catch(e){ console.log("[ExitBypass] _invokeHandler hook error:", e); }

  // 3) Präsentation beobachten: loggen, welche Alerts kommen (keine Blockade)
  try {
    const UIViewController = ObjC.classes.UIViewController;
    if (UIViewController && UIViewController["- presentViewController:animated:completion:"]) {
      Interceptor.attach(UIViewController["- presentViewController:animated:completion:"].implementation, {
        onEnter(args){
          try {
            const presented = new ObjC.Object(args[2]);
            const cn = presented.$className || "";
            if (cn === "UIAlertController") {
              const t = presented.title() ? presented.title().toString() : "";
              const m = presented.message() ? presented.message().toString() : "";
              console.log("[Present] UIAlertController:", t, "|", m);
            } else {
              console.log("[Present] VC:", cn);
            }
          } catch(_) {}
        }
      });
    }
  } catch(e){}

} else {
  console.log("[*] ObjC nicht verfügbar");
}

// 4) Notfall-Pfade: App-Terminierung wegpatchen (nur Exit-Wege, nicht die Präsentation)
(function(){
  const exit_ = Module.findExportByName(null, "exit");
  if (exit_) Interceptor.replace(exit_, new NativeCallback(function(code){ console.log("[ExitBypass] exit("+code+") unterdrückt"); }, 'void', ['int']));
  const _exit = Module.findExportByName(null, "_exit");
  if (_exit) Interceptor.replace(_exit, new NativeCallback(function(code){ console.log("[ExitBypass] _exit("+code+") unterdrückt"); }, 'void', ['int']));
  const abort_ = Module.findExportByName(null, "abort");
  if (abort_) Interceptor.replace(abort_, new NativeCallback(function(){ console.log("[ExitBypass] abort() unterdrückt"); }, 'void', []));
  const raise_ = Module.findExportByName(null, "raise");
  if (raise_) {
    Interceptor.attach(raise_, {
      onEnter(args){ const sig = args[0].toInt32(); if (sig===5/*SIGTRAP*/||sig===9/*SIGKILL*/){ this.block=true; console.log("[ExitBypass] raise("+sig+") -> 0"); } },
      onLeave(ret){ if (this.block) ret.replace(0); }
    });
  }
  const kill_ = Module.findExportByName(null, "kill");
  if (kill_) {
    Interceptor.attach(kill_, {
      onEnter(args){ if (args[0].toInt32()===Process.id){ const sig=args[1].toInt32(); if (sig===5||sig===9){ this.block=true; console.log("[ExitBypass] kill(self,"+sig+") -> 0"); } } },
      onLeave(ret){ if (this.block) ret.replace(0); }
    });
  }

  // Private UIKit-Terminierungen (falls verwendet)
  try {
    if (ObjC.available) {
      const UIApplication = ObjC.classes.UIApplication;
      if (UIApplication && UIApplication["- _terminateWithStatus:"]) {
        Interceptor.attach(UIApplication["- _terminateWithStatus:"].implementation, {
          onEnter(args){ console.log("[ExitBypass] UIKit _terminateWithStatus("+args[2].toInt32()+") unterdrückt"); },
          onLeave(ret){ ret.replace(ptr(0)); }
        });
      }
      if (UIApplication && UIApplication["- terminateWithSuccess"]) {
        Interceptor.attach(UIApplication["- terminateWithSuccess"].implementation, {
          onLeave(ret){ console.log("[ExitBypass] UIKit terminateWithSuccess unterdrückt"); ret.replace(ptr(0)); }
        });
      }
    }
  } catch(_) {}
})();
