#!/bin/bash

# Montar rclone
/usr/bin/rclone mount jinetes:/ /media/jinetes/ --config=/root/.config/rclone/rclone.conf --vfs-cache-mode off --allow-other &



