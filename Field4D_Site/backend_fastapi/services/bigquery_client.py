from functools import lru_cache
from typing import Iterable

from google.cloud import bigquery

from config.settings import get_settings


@lru_cache
def get_bigquery_client() -> bigquery.Client:
    settings = get_settings()
    return bigquery.Client(project=settings.google_cloud_project)


def run_query(
    query: str,
    query_parameters: list[bigquery.ScalarQueryParameter | bigquery.ArrayQueryParameter],
) -> Iterable[bigquery.table.Row]:
    client = get_bigquery_client()
    job_config = bigquery.QueryJobConfig(query_parameters=query_parameters)
    query_job = client.query(query, job_config=job_config)
    return query_job.result()
