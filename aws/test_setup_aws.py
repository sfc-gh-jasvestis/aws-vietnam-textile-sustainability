import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from setup_aws import ident, names


class SetupAwsTests(unittest.TestCase):
    def test_names_are_scoped_to_prefix_account_region(self):
        n = names('vn-textile-sustainability', '123456789012', 'us-west-2')
        self.assertEqual(n['bucket'], 'vn-textile-sustainability-123456789012-us-west-2')
        self.assertEqual(n['storage_int'], 'VN_TEXTILE_SUSTAINABILITY_S3_INT')
        self.assertEqual(n['iot_rule'], 'vn_textile_sustainability_telemetry')

    def test_rejects_unsafe_identifiers(self):
        for bad in ['DB; DROP', 'a-b', '1abc', '']:
            with self.assertRaises(ValueError):
                ident(bad)


    def test_publish_request_matches_botocore_schema(self):
        import json
        import re
        import botocore.session
        from botocore.validate import ParamValidator
        src = (Path(__file__).resolve().parent / 'publish_telemetry.py').read_text()
        self.assertIn("f'TX-{", src)
        msg = {'site_id': 'TX-0001', 'event_ts': '2026-01-01T00:00:00.000',
               'cod_mgl': 25.0, 'etp_load_pct': 70.0, 'status': 'NORMAL'}
        for key in msg:
            self.assertIn(f"'{key}'", src)
        setup = (Path(__file__).resolve().parent / 'setup_aws.py').read_text()
        # The topic rule adds iot_received_ms; every other COPY field comes from the publisher.
        self.assertIn('AS iot_received_ms', setup)
        for key in re.findall(r"\$1:([a-z_]+)::", setup):
            if key != 'iot_received_ms':
                self.assertIn(key, msg)
        model = botocore.session.get_session().get_service_model('iot-data')
        shape = model.operation_model('Publish').input_shape
        report = ParamValidator().validate(
            {'topic': 'vn/textile-sustainability/telemetry', 'qos': 1, 'payload': json.dumps(msg)}, shape)
        self.assertFalse(report.has_errors(), report.generate_report())


if __name__ == '__main__':
    unittest.main()
