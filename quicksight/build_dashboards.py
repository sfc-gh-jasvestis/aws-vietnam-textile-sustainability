"""
QuickSight Dashboard Builder — AWS SEA Demo Template
Programmatically creates a QuickSight dashboard connected to Snowflake via DIRECT_QUERY.

Prerequisites:
- AWS CLI configured with QuickSight access (account <YOUR_AWS_ACCOUNT_ID>, us-west-2)
- Snowflake data source registered in QuickSight
- Amazon Q enabled on the QuickSight account

Usage:
  python build_dashboards.py --demo-name {{DEMO_NAME}} --database {{DEMO_DB}}
"""

import boto3
import json
import argparse
from datetime import datetime

ACCOUNT_ID = '<YOUR_AWS_ACCOUNT_ID>'
REGION = 'us-west-2'
QS_NAMESPACE = 'default'

# Snowflake connection details (registered in QuickSight)
SNOWFLAKE_DATA_SOURCE_ID = 'snowflake-sea-demos'

def get_client():
    return boto3.client('quicksight', region_name=REGION)

def create_dataset(client, demo_name, database, tables):
    """Create a QuickSight dataset from Snowflake tables via DIRECT_QUERY."""
    dataset_id = f'{demo_name}-dataset'
    
    physical_tables = {}
    for i, table in enumerate(tables):
        physical_tables[f'table_{i}'] = {
            'CustomSql': {
                'DataSourceArn': f'arn:aws:quicksight:{REGION}:{ACCOUNT_ID}:datasource/{SNOWFLAKE_DATA_SOURCE_ID}',
                'Name': table['name'],
                'SqlQuery': f"SELECT * FROM {database}.{table['schema']}.{table['table']}",
                'Columns': table['columns']
            }
        }
    
    response = client.create_data_set(
        AwsAccountId=ACCOUNT_ID,
        DataSetId=dataset_id,
        Name=f'{demo_name} Dataset',
        PhysicalTableMap=physical_tables,
        ImportMode='DIRECT_QUERY',
        Permissions=[{
            'Principal': f'arn:aws:quicksight:{REGION}:{ACCOUNT_ID}:user/{QS_NAMESPACE}/admin',
            'Actions': [
                'quicksight:DescribeDataSet',
                'quicksight:DescribeDataSetPermissions',
                'quicksight:PassDataSet',
                'quicksight:DescribeIngestion',
                'quicksight:ListIngestions',
            ]
        }]
    )
    print(f"Created dataset: {dataset_id}")
    return dataset_id

def create_dashboard(client, demo_name, dataset_id, theme_arn):
    """Create QuickSight dashboard with Snowflake brand theme."""
    dashboard_id = f'{demo_name}-dashboard'
    
    response = client.create_dashboard(
        AwsAccountId=ACCOUNT_ID,
        DashboardId=dashboard_id,
        Name=f'{demo_name} Dashboard',
        ThemeArn=theme_arn,
        Definition={
            'DataSetIdentifierDeclarations': [{
                'Identifier': 'main',
                'DataSetArn': f'arn:aws:quicksight:{REGION}:{ACCOUNT_ID}:dataset/{dataset_id}'
            }],
            'Sheets': [{
                'SheetId': 'overview',
                'Name': 'Executive Overview',
                'Visuals': []  # Populated per-demo
            }]
        },
        Permissions=[{
            'Principal': f'arn:aws:quicksight:{REGION}:{ACCOUNT_ID}:user/{QS_NAMESPACE}/admin',
            'Actions': [
                'quicksight:DescribeDashboard',
                'quicksight:ListDashboardVersions',
                'quicksight:QueryDashboard',
            ]
        }]
    )
    print(f"Created dashboard: {dashboard_id}")
    print(f"URL: https://{REGION}.quicksight.aws.amazon.com/sn/dashboards/{dashboard_id}")
    return dashboard_id

def create_theme(client):
    """Create Snowflake-branded theme."""
    with open('theme.json', 'r') as f:
        theme_config = json.load(f)
    
    theme_id = 'snowflake-sea-demos-theme'
    try:
        response = client.create_theme(
            AwsAccountId=ACCOUNT_ID,
            ThemeId=theme_id,
            Name='Snowflake SEA Demos',
            Configuration=theme_config,
            Permissions=[{
                'Principal': f'arn:aws:quicksight:{REGION}:{ACCOUNT_ID}:user/{QS_NAMESPACE}/admin',
                'Actions': ['quicksight:DescribeTheme', 'quicksight:ListThemeVersions']
            }]
        )
    except client.exceptions.ResourceExistsException:
        pass
    
    return f'arn:aws:quicksight:{REGION}:{ACCOUNT_ID}:theme/{theme_id}'

def teardown(client, demo_name):
    """Remove QuickSight resources after validation."""
    dashboard_id = f'{demo_name}-dashboard'
    dataset_id = f'{demo_name}-dataset'
    
    try:
        client.delete_dashboard(AwsAccountId=ACCOUNT_ID, DashboardId=dashboard_id)
        print(f"Deleted dashboard: {dashboard_id}")
    except Exception as e:
        print(f"Dashboard delete skipped: {e}")
    
    try:
        client.delete_data_set(AwsAccountId=ACCOUNT_ID, DataSetId=dataset_id)
        print(f"Deleted dataset: {dataset_id}")
    except Exception as e:
        print(f"Dataset delete skipped: {e}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Build QuickSight dashboard for SEA demo')
    parser.add_argument('--demo-name', required=True)
    parser.add_argument('--database', required=True)
    parser.add_argument('--teardown', action='store_true', help='Remove resources after validation')
    args = parser.parse_args()
    
    client = get_client()
    
    if args.teardown:
        teardown(client, args.demo_name)
    else:
        theme_arn = create_theme(client)
        # Tables defined per-demo (override in demo-specific script)
        tables = [
            {
                'name': 'Category KPIs',
                'schema': 'CURATED',
                'table': '{{DT_3_NAME}}',
                'columns': [
                    {'Name': 'CATEGORY', 'Type': 'STRING'},
                    {'Name': 'ENTITY_COUNT', 'Type': 'INTEGER'},
                    {'Name': 'TOTAL_VALUE', 'Type': 'DECIMAL'},
                    {'Name': 'CRITICAL_COUNT', 'Type': 'INTEGER'},
                ]
            }
        ]
        dataset_id = create_dataset(client, args.demo_name, args.database, tables)
        create_dashboard(client, args.demo_name, dataset_id, theme_arn)
