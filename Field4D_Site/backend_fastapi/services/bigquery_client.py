from functools import lru_cache
from typing import Iterable

from google.cloud import bigquery
from google.cloud import bigquery_storage_v1

from config.settings import get_settings


@lru_cache
def get_bigquery_client() -> bigquery.Client:
    settings = get_settings()
    return bigquery.Client(project=settings.google_cloud_project)


@lru_cache
def get_bigquery_storage_client() -> bigquery_storage_v1.BigQueryReadClient:
    """Reuse the authenticated read client; this grants no BigQuery write path."""
    return bigquery_storage_v1.BigQueryReadClient(
        credentials=get_bigquery_client()._credentials
    )


def run_query(
    query: str,
    query_parameters: list[bigquery.ScalarQueryParameter | bigquery.ArrayQueryParameter],
) -> Iterable[bigquery.table.Row]:
    client = get_bigquery_client()
    job_config = bigquery.QueryJobConfig(query_parameters=query_parameters)
    query_job = client.query(query, job_config=job_config)
    return query_job.result()


def start_query(
    query: str,
    query_parameters: list[bigquery.ScalarQueryParameter | bigquery.ArrayQueryParameter],
    location: str | None = None,
) -> bigquery.QueryJob:
    """Start a parameterized read query and return its job for metrics/cancellation."""
    client = get_bigquery_client()
    job_config = bigquery.QueryJobConfig(query_parameters=query_parameters)
    return client.query(query, job_config=job_config, location=location)


def run_query_with_job(
    query: str,
    query_parameters: list[bigquery.ScalarQueryParameter | bigquery.ArrayQueryParameter],
) -> tuple[Iterable[bigquery.table.Row], bigquery.QueryJob]:
    query_job = start_query(query=query, query_parameters=query_parameters)
    return query_job.result(), query_job
