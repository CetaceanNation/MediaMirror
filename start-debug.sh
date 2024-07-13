#!/bin/bash
source ./venv/bin/activate
run=""
while [ -z $run ]; do
    flask --app "./mediamirror/app.py" run --debug
    echo ""
    read -p "Press Enter to run again, enter anything to exit: " run
    echo ""
done
