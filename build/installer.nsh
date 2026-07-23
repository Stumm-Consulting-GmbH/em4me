; Custom NSIS-Skript für EM4me
; (Registry-ProgID heißt aus Migrations-Gründen weiterhin „MarkdownViewer.md" —
; siehe Kommentar bei customInstall: Umbenennen würde Datei-Assoziationen aus
; einer bestehenden 0.5.x-Installation nicht sauber überschreiben.)
; Bietet eine optionale Datei-Assoziation für .md, .markdown, .mdown, .mkd
; Wird per electron-builder via nsis.include eingebunden.

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var AssocDialog
Var AssocCheckbox
Var AssocCheckbox_State

; --- Default-Status der Checkbox: aktiviert ---------------------------------
!macro preInit
  StrCpy $AssocCheckbox_State ${BST_CHECKED}
!macroend

; --- Custom-Page wird vor Welcome eingefügt ---------------------------------
; (electron-builder bietet keinen Hook zwischen Directory- und InstFiles-Page,
; daher steht diese Seite ganz vorne im Setup-Flow.)
!macro customHeader
  Page custom AssocPageCreate AssocPageLeave
!macroend

Function AssocPageCreate
  !insertmacro MUI_HEADER_TEXT "Datei-Assoziation" "Optional: Markdown-Dateien direkt mit EM4me öffnen"

  nsDialogs::Create 1018
  Pop $AssocDialog
  ${If} $AssocDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 36u "Sie können festlegen, ob Markdown-Dateien (.md, .markdown, .mdown, .mkd) standardmäßig mit EM4me geöffnet werden sollen.$\r$\n$\r$\nDiese Einstellung kann jederzeit über die Windows-Einstellungen ($\"Standard-Apps$\") wieder geändert werden."
  Pop $0

  ${NSD_CreateCheckbox} 0 60u 100% 12u "EM4me für .md-Dateien registrieren"
  Pop $AssocCheckbox
  ${If} $AssocCheckbox_State == ${BST_CHECKED}
    ${NSD_Check} $AssocCheckbox
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function AssocPageLeave
  ${NSD_GetState} $AssocCheckbox $AssocCheckbox_State
FunctionEnd

; --- Nach erfolgreicher Installation: Registry-Einträge anlegen -------------
!macro customInstall
  ${If} $AssocCheckbox_State == ${BST_CHECKED}
    ; ProgID anlegen
    WriteRegStr HKCU "Software\Classes\MarkdownViewer.md" "" "Markdown-Datei"
    WriteRegStr HKCU "Software\Classes\MarkdownViewer.md\DefaultIcon" "" '"$INSTDIR\${PRODUCT_FILENAME}.exe",0'
    WriteRegStr HKCU "Software\Classes\MarkdownViewer.md\shell" "" "open"
    WriteRegStr HKCU "Software\Classes\MarkdownViewer.md\shell\open" "" "Öffnen"
    WriteRegStr HKCU "Software\Classes\MarkdownViewer.md\shell\open\command" "" '"$INSTDIR\${PRODUCT_FILENAME}.exe" "%1"'

    ; Endungen verlinken
    WriteRegStr HKCU "Software\Classes\.md" "" "MarkdownViewer.md"
    WriteRegStr HKCU "Software\Classes\.markdown" "" "MarkdownViewer.md"
    WriteRegStr HKCU "Software\Classes\.mdown" "" "MarkdownViewer.md"
    WriteRegStr HKCU "Software\Classes\.mkd" "" "MarkdownViewer.md"

    ; OpenWithProgIDs (taucht in "Öffnen mit"-Liste auf)
    WriteRegStr HKCU "Software\Classes\.md\OpenWithProgids" "MarkdownViewer.md" ""
    WriteRegStr HKCU "Software\Classes\.markdown\OpenWithProgids" "MarkdownViewer.md" ""
    WriteRegStr HKCU "Software\Classes\.mdown\OpenWithProgids" "MarkdownViewer.md" ""
    WriteRegStr HKCU "Software\Classes\.mkd\OpenWithProgids" "MarkdownViewer.md" ""

    ; Marker für sauberes Uninstall
    WriteRegStr HKCU "Software\MarkdownViewer\InstallSettings" "FileAssoc" "1"

    ; Shell-Notification, damit der Explorer die neue Assoziation aufnimmt
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
  ${Else}
    WriteRegStr HKCU "Software\MarkdownViewer\InstallSettings" "FileAssoc" "0"
  ${EndIf}
!macroend

; --- Beim Deinstallieren: Einträge entfernen, falls sie zu uns gehören ------
; X-04 (4T-0182): KEIN DeleteRegKey auf die Extension-Keys — das löschte den
; gesamten Key rekursiv inklusive der OpenWithProgids-Werte FREMDER Programme.
; Stattdessen wird nur der eigene Default-Wert zurückgesetzt und der eigene
; OpenWithProgids-Eintrag entfernt; der Extension-Key selbst bleibt bestehen.
!macro customUnInstall
  ; Default-Wert der Endungen nur leeren, wenn er auf unsere ProgID zeigt —
  ; sonst könnten wir eine inzwischen anders gesetzte Assoziation eines
  ; anderen Programms mit aushebeln.
  ReadRegStr $0 HKCU "Software\Classes\.md" ""
  ${If} $0 == "MarkdownViewer.md"
    DeleteRegValue HKCU "Software\Classes\.md" ""
  ${EndIf}
  ReadRegStr $0 HKCU "Software\Classes\.markdown" ""
  ${If} $0 == "MarkdownViewer.md"
    DeleteRegValue HKCU "Software\Classes\.markdown" ""
  ${EndIf}
  ReadRegStr $0 HKCU "Software\Classes\.mdown" ""
  ${If} $0 == "MarkdownViewer.md"
    DeleteRegValue HKCU "Software\Classes\.mdown" ""
  ${EndIf}
  ReadRegStr $0 HKCU "Software\Classes\.mkd" ""
  ${If} $0 == "MarkdownViewer.md"
    DeleteRegValue HKCU "Software\Classes\.mkd" ""
  ${EndIf}

  ; Eigene OpenWithProgIDs-Einträge entfernen (fremde bleiben unberührt)
  DeleteRegValue HKCU "Software\Classes\.md\OpenWithProgids" "MarkdownViewer.md"
  DeleteRegValue HKCU "Software\Classes\.markdown\OpenWithProgids" "MarkdownViewer.md"
  DeleteRegValue HKCU "Software\Classes\.mdown\OpenWithProgids" "MarkdownViewer.md"
  DeleteRegValue HKCU "Software\Classes\.mkd\OpenWithProgids" "MarkdownViewer.md"

  ; ProgID und eigenen Settings-Pfad entfernen (eigene Keys, rekursiv ok)
  DeleteRegKey HKCU "Software\Classes\MarkdownViewer.md"
  DeleteRegKey HKCU "Software\MarkdownViewer"

  ; Shell-Notification
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
