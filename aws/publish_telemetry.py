"""Publish simulated mill effluent COD and ETP load telemetry to AWS IoT Core (topic vn/textile-sustainability/telemetry).

The IoT rule lands each message in S3; Snowpipe loads it into RAW.LIVE_TELEMETRY.
Mill IDs come from RAW.MILLS (TX-0000..TX-0029). Values are seeded random.
"""
import argparse
import json
import random
from datetime import datetime, timezone


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--region', default='us-west-2')
    ap.add_argument('--count', type=int, default=40)
    ap.add_argument('--seed', type=int)
    args = ap.parse_args()
    import boto3
    iot = boto3.client('iot', region_name=args.region)
    endpoint = iot.describe_endpoint(endpointType='iot:Data-ATS')['endpointAddress']
    data = boto3.client('iot-data', region_name=args.region, endpoint_url=f'https://{endpoint}')
    rng = random.Random(args.seed)
    for _ in range(args.count):
        site = f'TX-{rng.randint(0, 29):04d}'
        alarm = rng.random() < 0.1
        msg = {'site_id': site,
               'event_ts': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3],
               'cod_mgl': round(rng.gauss(95.0 if alarm else 25.0, 6.0), 1),
               'etp_load_pct': round(min(100.0, rng.gauss(94 if alarm else 70, 3)), 1),
               'status': 'ALARM' if alarm else 'NORMAL'}
        data.publish(topic='vn/textile-sustainability/telemetry', qos=1, payload=json.dumps(msg))
    print(f'published {args.count} messages to vn/textile-sustainability/telemetry via {endpoint}')


if __name__ == '__main__':
    main()
