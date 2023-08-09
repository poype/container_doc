#!/bin/bash

INTERVAL=$1 # 
echo loop once every $INTERVAL seconds

while :
do
  echo loop
  sleep $INTERVAL
done