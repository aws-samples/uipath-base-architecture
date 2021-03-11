#!/usr/bin/env node
//SPDX-FileCopyrightText: Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
//
//SPDX-License-Identifier: MIT-0

import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { UiPathBaseArchitectureStack } from '../lib/ui_path_base_architecture-stack';

const app = new cdk.App();
new UiPathBaseArchitectureStack(app, 'UiPathBaseArchitectureStack');
