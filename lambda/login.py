import os
import json
import boto3
import logging
import requests
import jwt
from datetime import datetime, timedelta, timezone
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)


def lambda_handler(event, context):
    # Initialize DynamoDB client
    dynamodb = boto3.client('dynamodb')

    # Check required parameters
    body = json.loads(event['body'])

    if not {'username','password','remember','token'}.issubset(body.keys()):
        return {
            'statusCode': 400,
            'body': json.dumps({"message": "The username and password are required."})
        }

    # Get variables
    username = body['username']
    password = body['password']
    remember = body['remember']
    token = body['token']
    secret_key = os.environ['SECRET_KEY']

    # Check Cloudflare Turnstile token validity
    url = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    data = {
        "secret": os.environ['TURNSTILE_SECRET'],
        "response": token,
    }
    response = requests.post(url, data=data)
    response = response.json()

    if not response['success']:
        return {
            'statusCode': 400,
            'body': json.dumps({"message": "The Cloudflare token is not valid. Please try again."})
        }

    # Get DynamoDB user
    response = dynamodb.get_item(
        TableName='retrox-users',
        Key={'username': {'S': username}},
        ProjectionExpression='password,verify_code',
    )
    user = response.get('Item')

    # Check if user exists
    if not user:
        return {
            'statusCode': 400,
            'body': json.dumps({"message": "Invalid username or password."})
        }

    # Check if user is not yet verified
    if user.get('verify_code'):
        return {
            'statusCode': 400,
            'body': json.dumps({"message": "Account not verified. Check your email to complete the verification process."})
        }

    # Decrypt password
    f = Fernet(secret_key.encode())
    password_decrypted = f.decrypt(user['password']['S'].encode()).decode()

    # Check both passwords
    if password != password_decrypted:
        return {
            'statusCode': 400,
            'body': json.dumps({"message": "Invalid username or password."})
        }

    # Update user last_login
    try:
        dynamodb.update_item(
            TableName='retrox-users',
            Key={'username': {'S': username}},
            ExpressionAttributeNames={
                '#last_login': 'last_login',
            },
            ExpressionAttributeValues={
                ':last_login': {
                    'N': str(int(datetime.now(tz=timezone.utc).timestamp())),
                },
            },
            UpdateExpression='SET #last_login = :last_login',
            ConditionExpression='attribute_exists(username)',
        )
    except dynamodb.exceptions.ConditionalCheckFailedException:
        return {
            'statusCode': 400,
            'body': json.dumps({"message": "This account no longer exists."})
        }
    except Exception as e:
        logger.error(str(e))
        return {
            'statusCode': 400,
            'body': json.dumps({"message": "An error occurred retrieving the account. Please try again in a few minutes."})
        }
    
    # Generate token
    expiration = datetime.utcnow() + timedelta(days=30)
    payload = {'username': username, 'exp': int(expiration.timestamp())}
    token = jwt.encode(payload, secret_key, algorithm='HS256')

    # Return token as a parameter
    return {
        'statusCode': 200,
        'body': json.dumps({'token': token, 'username': username, 'remember': remember})
    }

    # Return token as a cookie
    cookie_expires = expiration.strftime('%a, %d %b %Y %H:%M:%S GMT')
    return {
        'statusCode': 200,
        "cookies": [
            f"token={token}; Expires={cookie_expires}; Secure; HttpOnly; SameSite=Strict; Path=/"
        ],
        'body': json.dumps({'username': username, 'expires': int(expiration.timestamp())})
    }