"""Scheduler job implementations.

Each module here exposes an idempotent async job function that the scheduler
service (app/scheduler/main.py) registers. Jobs open their own AsyncSession and
run on the app superuser (RLS bypass); they must log start, success, failure, and
duration.
"""
