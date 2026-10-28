Output docs/demo.gif
Require node
Set Shell "bash"
Set Width 900
Set Height 300
Set FontSize 22
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms
Set Framerate 15
Env PS1 "$ "
Hide
Type "unset PROMPT_COMMAND; clear"
Enter
Sleep 300ms
Show
Type "node docs/demo-session.mjs"
Enter
Sleep 17s
