; This macro is inserted after electron-builder's common.nsh, so the
; installed uninstaller name can be safely replaced.
!macro customHeader
  !undef UNINSTALL_FILENAME
  !define UNINSTALL_FILENAME "unins000.exe"
!macroend

; Default to D: for a new installation. Existing installs keep their path.
!macro customInit
  IfFileExists "$INSTDIR\unins000.exe" keepExisting
  StrCpy $INSTDIR "D:\工厂 Web3D 工作台"
  keepExisting:
!macroend
